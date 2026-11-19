/**
 * The store behind the rate limiter.
 *
 * A store counts the hits of one key inside one fixed window. It knows
 * nothing about the routes, the limits or the keys; it is only asked "count
 * this key once and tell me the total".
 *
 * Two stores exist:
 *
 * - `createMemoryStore` keeps the counts in a Map of this process. It is the
 *   default, and it is what the tests use.
 * - `createRedisStore` keeps the counts in Upstash Redis, so every instance of
 *   a serverless deployment shares them.
 *
 * The module has no dependency on the framework, so the rules of the store can
 * be proved by the test suite without a server and without a network.
 */

import { createHash } from "node:crypto";

import { Redis } from "@upstash/redis";

/** The longest a Redis command may take before the call is abandoned. */
export const DEFAULT_REDIS_TIMEOUT_MS = 1_500;

/** The longest a single failure is reported once. */
export const DEFAULT_LOG_THROTTLE_MS = 60_000;

/**
 * The value of the kill switch that selects the memory store.
 */
export const MEMORY_STORE_NAME = "memory";

/**
 * The value of the switch that selects the shared store.
 */
export const REDIS_STORE_NAME = "redis";

/**
 * Hashes an identifier before it is used in a key.
 *
 * The store keys contain user ids and session ids. Hashing keeps a dump of the
 * Redis keyspace from being a list of the accounts of the unit, and it makes
 * every key a fixed length whatever the input was.
 *
 * The hash is stable, so the same identifier always maps to the same key, and
 * it is not reversible.
 *
 * @param {string} value
 * @returns {string} sixteen hexadecimal characters
 */
export function hashIdentifier(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

/**
 * The window an instant belongs to.
 *
 * The identifier is part of the key, so a counter can never be read by a later
 * window. A stale counter is unreachable instead of merely expired.
 *
 * @param {number} now
 * @param {number} windowMs
 * @returns {number}
 */
export function windowIdFor(now, windowMs) {
  return Math.floor(now / windowMs);
}

/**
 * The number of seconds until the current window ends.
 *
 * It is computed from the local clock, so the answer needs no extra trip to
 * the store.
 *
 * @param {number} now
 * @param {number} windowMs
 * @returns {number}
 */
export function secondsUntilWindowEnd(now, windowMs) {
  return Math.max(1, Math.ceil((windowMs - (now % windowMs)) / 1000));
}

/**
 * A store that keeps the counts of this process only.
 *
 * It exists so that local development, the test suite and the kill switch need
 * no account and no network. It is not shared between instances.
 *
 * @param {{ now?: () => number }} [options]
 */
export function createMemoryStore({ now = () => Date.now() } = {}) {
  const counters = new Map();

  return {
    name: MEMORY_STORE_NAME,

    /**
     * Counts one hit and returns the total of the window.
     *
     * @param {string} key
     * @param {{ windowMs: number }} options
     * @returns {Promise<{ count: number, ttlMs: number }>}
     */
    async hit(key, { windowMs }) {
      const current = now();
      const windowId = windowIdFor(current, windowMs);
      const composite = `${key}:${windowId}`;

      const count = (counters.get(composite) ?? 0) + 1;
      counters.set(composite, count);

      // A window that ended is unreachable, but its entry would stay in memory.
      // The sweep runs rarely because the map is small.
      if (counters.size > 1_000) {
        for (const entry of counters.keys()) {
          if (!entry.endsWith(`:${windowId}`)) {
            counters.delete(entry);
          }
        }
      }

      return { count, ttlMs: windowMs };
    },

    /** A test and diagnostic helper, not part of the limiting contract. */
    size() {
      return counters.size;
    },
  };
}

/**
 * The Lua script of the shared counter.
 *
 * INCR and the expiry run as one atomic step inside Redis. A second caller can
 * never read the counter between the two commands, so the window cannot be
 * split.
 *
 * The expiry is set only when the key has none. A normal hit that arrives at a
 * key which already has a TTL therefore leaves that TTL untouched, which keeps
 * the fixed window fixed instead of letting each hit extend it.
 *
 * PTTL is -1 when the key exists without an expiration. That state must be
 * repaired: an INCR that ran once without a following PEXPIRE leaves a key
 * that would otherwise live forever, and the `count == 1` guard of the naive
 * script would never run PEXPIRE again.
 *
 * PTTL is -2 when the key does not exist. That is a harmless race with an
 * expiry between the INCR and the PTTL; the intended expiry is restored.
 *
 * The script returns the total and the TTL that now applies, so one call is
 * enough for a decision.
 */
export const INCREMENT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

/**
 * A store that keeps the counts in Upstash Redis.
 *
 * @param {{
 *   client?: { eval: Function },
 *   now?: () => number,
 *   timeoutMs?: number,
 *   prefix?: string,
 * }} [options]
 */
export function createRedisStore({
  client,
  now = () => Date.now(),
  timeoutMs = DEFAULT_REDIS_TIMEOUT_MS,
  prefix = "rl",
} = {}) {
  if (!client || typeof client.eval !== "function") {
    throw new Error("A Redis client with an eval method is required");
  }

  return {
    name: REDIS_STORE_NAME,

    /**
     * Counts one hit and returns the total of the window.
     *
     * @param {string} key
     * @param {{ windowMs: number }} options
     * @returns {Promise<{ count: number, ttlMs: number }>}
     */
    async hit(key, { windowMs }) {
      const windowId = windowIdFor(now(), windowMs);
      const redisKey = `${prefix}:${key}:${windowId}`;

      const started = Date.now();

      const answer = await withTimeout(
        client.eval(INCREMENT_SCRIPT, [redisKey], [windowMs]),
        timeoutMs,
        () => {
          const error = new Error("The rate limit store timed out");
          error.code = "RATE_LIMIT_TIMEOUT";
          return error;
        }
      );

      const count = Number(Array.isArray(answer) ? answer[0] : answer);

      if (!Number.isFinite(count)) {
        const error = new Error("The rate limit store returned an unusable answer");
        error.code = "RATE_LIMIT_BAD_ANSWER";
        throw error;
      }

      const ttl = Array.isArray(answer) ? Number(answer[1]) : NaN;

      // The script sets the expiry whenever Redis reported a missing one, so a
      // negative TTL cannot reach this point on a healthy server. A value that
      // is still unusable is reported as the whole window, which is the shortest
      // useful answer for a caller that has to wait. A value of zero is treated
      // the same way, because a caller told to wait zero seconds would retry at
      // once against a key that is still over its limit.
      const ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs;

      return {
        count,
        ttlMs,
        latencyMs: Date.now() - started,
      };
    },
  };
}

/**
 * Rejects after `timeoutMs` if the given promise has not settled.
 *
 * A store that never answers would otherwise hold the request until the
 * platform kills the function. The abandoned promise is not awaited; its
 * rejection is absorbed so it cannot become an unhandled rejection.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {() => Error} makeError
 * @returns {Promise<T>}
 */
export function withTimeout(promise, timeoutMs, makeError) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(makeError()), timeoutMs);

    // A pending timer must not keep the process alive.
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

/**
 * Reads the store selection out of the environment.
 *
 * The function never throws. A missing or unexpected value selects the memory
 * store, because an unconfigured deployment must keep working.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{
 *   mode: "memory" | "redis",
 *   requested: "memory" | "redis" | null,
 *   explicit: boolean,
 *   url: string | null,
 *   token: string | null,
 *   problems: string[],
 * }}
 */
export function readStoreConfig(env = {}) {
  const problems = [];

  const raw = (env.RATE_LIMIT_STORE ?? "").trim().toLowerCase();

  // An empty value means the operator did not choose. That is different from
  // an operator who chose the memory store on purpose, and the two must be
  // distinguishable so that only the second one is silent.
  const explicit = raw !== "";

  const requested =
    raw === "" || raw === MEMORY_STORE_NAME
      ? MEMORY_STORE_NAME
      : raw === REDIS_STORE_NAME
        ? REDIS_STORE_NAME
        : null;

  if (requested === null) {
    problems.push(
      `RATE_LIMIT_STORE="${env.RATE_LIMIT_STORE}" is not recognised`
    );
    return {
      mode: MEMORY_STORE_NAME,
      requested: null,
      explicit,
      url: null,
      token: null,
      problems,
    };
  }

  if (requested === MEMORY_STORE_NAME) {
    return {
      mode: MEMORY_STORE_NAME,
      requested: MEMORY_STORE_NAME,
      explicit,
      url: null,
      token: null,
      problems,
    };
  }

  const url = (env.UPSTASH_REDIS_REST_URL ?? "").trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();

  if (url === "") {
    problems.push("UPSTASH_REDIS_REST_URL is not set");
  } else if (!/^https?:\/\/[^\s]+$/.test(url)) {
    problems.push("UPSTASH_REDIS_REST_URL is not a URL");
  }

  if (token === "") {
    problems.push("UPSTASH_REDIS_REST_TOKEN is not set");
  }

  if (problems.length > 0) {
    return {
      mode: MEMORY_STORE_NAME,
      requested: REDIS_STORE_NAME,
      explicit,
      url: null,
      token: null,
      problems,
    };
  }

  return {
    mode: REDIS_STORE_NAME,
    requested: REDIS_STORE_NAME,
    explicit,
    url,
    token,
    problems,
  };
}

/**
 * Reports a failure at most once per throttle window.
 *
 * A store outage would otherwise write one line per request, and the log would
 * become a second outage. One line per scope per minute is enough to notice.
 *
 * @param {{
 *   throttleMs?: number,
 *   now?: () => number,
 *   report?: (event: Record<string, unknown>) => void,
 * }} [options]
 */
export function createThrottledLogger({
  throttleMs = DEFAULT_LOG_THROTTLE_MS,
  now = () => Date.now(),
  report = (event) => console.error("rate limiter:", event),
} = {}) {
  const lastReport = new Map();
  let suppressed = 0;

  return {
    /**
     * @param {string} scope
     * @param {Error} error
     */
    reportFailure(scope, error) {
      const current = now();
      const previous = lastReport.get(scope);

      if (previous !== undefined && current - previous < throttleMs) {
        suppressed += 1;
        return false;
      }

      lastReport.set(scope, current);

      const event = {
        event: "rate_limiter_unavailable",
        scope,
        code: error?.code ?? "RATE_LIMIT_ERROR",
        // The message of a store error is safe; a key is not.
        message: error?.message ?? "unknown",
        // How many failures were hidden since the last line.
        suppressedSinceLastReport: suppressed,
      };

      suppressed = 0;
      report(event);

      return true;
    },

    suppressed() {
      return suppressed;
    },
  };
}

/**
 * Builds the Redis client for a validated configuration.
 *
 * The client is created once and reused, so a warm instance keeps its
 * connection state instead of building a new client per request.
 *
 * @param {{ url: string, token: string, timeoutMs?: number }} config
 */
export function createRedisClient({ url, token, timeoutMs = DEFAULT_REDIS_TIMEOUT_MS }) {
  return new Redis({
    url,
    token,
    // Upstash counts a retry against the function budget, so a limit call
    // never retries: a failure is handled by the fail-open path instead.
    retry: { retries: 0 },
    signal: () => AbortSignal.timeout(timeoutMs),
  });
}
