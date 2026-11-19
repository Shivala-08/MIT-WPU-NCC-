/**
 * The rate limiter of the write heavy attendance routes.
 *
 * Two things are deliberately separate:
 *
 * - `createRateLimiter` decides whether a key is over its limit. That rule,
 *   the shape of the answer and the exported limiters are unchanged.
 * - The store counts the hits. By default the count lives in a Map of this
 *   process, exactly as before. A shared store can be injected instead, so a
 *   deployment with more than one instance can trust the limits across
 *   instances.
 *
 * The default stays in memory on purpose: a forgotten environment variable
 * must never silently weaken a limit, and local development and the test
 * suite need no account and no network.
 */

import {
  INCREMENT_SCRIPT,
  MEMORY_STORE_NAME,
  REDIS_STORE_NAME,
  createMemoryStore,
  createRedisClient,
  createRedisStore,
  createThrottledLogger,
  hashIdentifier,
  readStoreConfig,
  secondsUntilWindowEnd,
  windowIdFor,
} from "./rate-limit-store.mjs";

export function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();

  return function check(key) {
    const now = Date.now();
    const entry = hits.get(key);
    const timestamps = (entry ?? []).filter(
      (stamp) => now - stamp < windowMs
    );

    if (timestamps.length >= limit) {
      hits.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(
          (windowMs - (now - timestamps[0])) / 1000
        ),
      };
    }

    timestamps.push(now);
    hits.set(key, timestamps);

    return {
      allowed: true,
      remaining: limit - timestamps.length,
      retryAfterSeconds: 0,
    };
  };
}

/**
 * Builds a limiter that asks a store for the count of the window.
 *
 * The answer has the same shape as the synchronous limiter, so a caller only
 * has to await it. A store failure allows the request and is reported once per
 * scope per minute: an outage of the store must not stop a cadet from checking
 * in during a parade.
 *
 * @param {{
 *   limit: number,
 *   windowMs: number,
 *   store: { name: string, hit: Function },
 *   scope?: string,
 *   logger?: { reportFailure: Function },
 * }>}
 */
export function createStoreLimiter({
  limit,
  windowMs,
  store,
  scope = "rate-limit",
  logger = createThrottledLogger(),
}) {
  if (!store || typeof store.hit !== "function") {
    throw new Error("A store with a hit method is required");
  }

  return async function check(key) {
    const windowKey = `${scope}:${hashIdentifier(key)}`;

    let answer;

    try {
      answer = await store.hit(windowKey, { windowMs });
    } catch (error) {
      // Fail open. The request is allowed, and the failure is reported at most
      // once per scope per minute so an outage cannot cause a log flood.
      logger.reportFailure(scope, error);

      return {
        allowed: true,
        remaining: limit,
        retryAfterSeconds: 0,
        degraded: true,
      };
    }

    const count = Number(answer?.count);

    if (!Number.isFinite(count)) {
      logger.reportFailure(
        scope,
        new Error("The rate limit store returned an unusable answer")
      );

      return {
        allowed: true,
        remaining: limit,
        retryAfterSeconds: 0,
        degraded: true,
      };
    }

    if (count > limit) {
      const ttlMs =
        Number.isFinite(answer?.ttlMs) && answer.ttlMs > 0
          ? answer.ttlMs
          : windowMs;

      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: 0,
    };
  };
}

/**
 * Builds the store named by the environment.
 *
 * A missing, unexpected or incomplete configuration selects the memory store.
 * The memory store is not shared between instances, so a production deployment
 * that ends up on it is reporting a real weakening of the limits. The cases are
 * therefore reported differently:
 *
 * - an operator who set `RATE_LIMIT_STORE=memory` asked for it, and is silent;
 * - any other way of reaching memory in production is reported;
 * - outside production the memory store is the normal case and is silent, so
 *   local development and the test suite stay quiet.
 *
 * The report goes through the throttled logger, so a factory called per request
 * still writes one line per minute and not one line per call.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{
 *   logger?: { reportFailure: Function },
 *   now?: () => number,
 *   nodeEnv?: string,
 * }} [options]
 */
export function createStoreFromEnv(
  env = typeof process === "undefined" ? {} : process.env,
  {
    logger = createThrottledLogger(),
    now = () => Date.now(),
    nodeEnv = env.NODE_ENV ?? (typeof process === "undefined" ? "" : process.env.NODE_ENV),
  } = {}
) {
  const config = readStoreConfig(env);

  if (config.mode === MEMORY_STORE_NAME) {
    const isProduction = nodeEnv === "production";

    if (config.problems.length > 0) {
      // A degraded configuration is always reported, in every environment: a
      // deployment that asked for the shared store must learn that it is not on
      // it. The message carries the names of the problems only, never a URL or
      // a token.
      logger.reportFailure(
        "config",
        Object.assign(new Error(config.problems.join("; ")), {
          code: "RATE_LIMIT_CONFIG",
        })
      );
    } else if (isProduction && !config.explicit) {
      // Nothing was configured at all. In production that is a silent
      // weakening, so it is reported; the message names the variable to set.
      logger.reportFailure(
        "config",
        Object.assign(
          new Error(
            "RATE_LIMIT_STORE is not set, so the rate limiter uses the memory " +
              "store of each instance. Set RATE_LIMIT_STORE=redis for a shared store."
          ),
          { code: "RATE_LIMIT_MEMORY_FALLBACK" }
        )
      );
    }

    return {
      store: createMemoryStore({ now }),
      mode: MEMORY_STORE_NAME,
      explicit: config.explicit,
      problems: config.problems,
    };
  }

  const client = createRedisClient({ url: config.url, token: config.token });

  return {
    store: createRedisStore({ client, now }),
    mode: REDIS_STORE_NAME,
    explicit: config.explicit,
    problems: config.problems,
  };
}

/**
 * The limiter of one scope, built from the environment.
 *
 * The exported limiters are created once when the module is loaded, so the
 * environment is read once per process and not once per request.
 *
 * When no shared store is configured the limiter is the original synchronous
 * in-memory limiter, unchanged. That keeps the current behaviour of every call
 * site and keeps the test suite free of a network and of a clock. Only a
 * deployment that sets `RATE_LIMIT_STORE=redis` gets the shared limiter, and
 * only that deployment has to await the answer.
 *
 * @param {{ limit: number, windowMs: number, scope: string }} options
 * @returns {(key: string) => RateLimitAnswer | Promise<RateLimitAnswer>}
 */
function createLimiterForScope({ limit, windowMs, scope }) {
  const { store, mode } = createStoreFromEnv(undefined, {
    logger: createThrottledLogger(),
  });

  if (mode === MEMORY_STORE_NAME) {
    // The default path is the original limiter, byte for byte. A deployment
    // that never configured a store therefore behaves exactly as before.
    return createRateLimiter({ limit, windowMs });
  }

  return createStoreLimiter({ limit, windowMs, store, scope });
}

export const checkInLimiter = createLimiterForScope({
  limit: 20,
  windowMs: 5 * 60_000,
  scope: "check-in",
});

// The six digit fallback code is a small space, so the verification attempts
// are limited per cadet and per session.
export const manualCodeLimiter = createLimiterForScope({
  limit: 10,
  windowMs: 10 * 60_000,
  scope: "manual-code",
});

export const manualCodeSessionLimiter = createLimiterForScope({
  limit: 60,
  windowMs: 10 * 60_000,
  scope: "manual-code-session",
});

export const bulkMarkLimiter = createLimiterForScope({
  limit: 30,
  windowMs: 60_000,
  scope: "records",
});

export {
  INCREMENT_SCRIPT,
  MEMORY_STORE_NAME,
  REDIS_STORE_NAME,
  createMemoryStore,
  createRedisClient,
  createRedisStore,
  createThrottledLogger,
  hashIdentifier,
  readStoreConfig,
  secondsUntilWindowEnd,
  windowIdFor,
};
