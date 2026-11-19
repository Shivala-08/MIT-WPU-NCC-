import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INCREMENT_SCRIPT,
  MEMORY_STORE_NAME,
  REDIS_STORE_NAME,
  createMemoryStore,
  createRedisStore,
  createRateLimiter,
  createStoreFromEnv,
  createStoreLimiter,
  createThrottledLogger,
  hashIdentifier,
  readStoreConfig,
  secondsUntilWindowEnd,
  windowIdFor,
} from "../src/lib/rate-limit.mjs";
import { withTimeout } from "../src/lib/rate-limit-store.mjs";

const WINDOW = 60_000;

/**
 * A fake Redis that implements the atomic script of the store.
 *
 * It keeps the counters and their expiry, so the behaviour of the real script
 * can be asserted without a network. It records the calls, so the test can
 * prove that the count and the expiry are issued as one atomic step.
 */
function createFakeRedis({ failWith = null, delayMs = 0, badAnswer = false } = {}) {
  const counters = new Map();
  const calls = [];

  return {
    counters,
    calls,

    async eval(script, keys, args) {
      calls.push({ script, keys, args });

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      if (failWith) {
        throw failWith;
      }

      if (badAnswer) {
        return "not-a-number";
      }

      const [key] = keys;
      const [pexpireMs] = args;

      const count = (counters.get(key)?.count ?? 0) + 1;

      // Mirrors INCREMENT_SCRIPT: the expiry is written only when the key has
      // none. A hit on a key that already has a TTL leaves that TTL alone, so
      // the window stays fixed instead of sliding.
      const existing = counters.get(key);
      const hasTtl = existing && typeof existing.ttl === "number" && existing.ttl > 0;
      const ttl = hasTtl ? existing.ttl : Number(pexpireMs);

      counters.set(key, { count, ttl });

      return [count, ttl];
    },

    /** Seeds a key the way a broken writer would: counted, but with no expiry. */
    seedWithoutTtl(key, count) {
      counters.set(key, { count, ttl: -1 });
    },
  };
}

// ---------------------------------------------------------------- memory store

test("the memory store counts the hits of one window", async () => {
  const store = createMemoryStore({ now: () => 1_000_000 });

  assert.equal((await store.hit("scope:abc", { windowMs: WINDOW })).count, 1);
  assert.equal((await store.hit("scope:abc", { windowMs: WINDOW })).count, 2);
  assert.equal((await store.hit("scope:abc", { windowMs: WINDOW })).count, 3);
});

test("the memory store keeps keys apart", async () => {
  const store = createMemoryStore({ now: () => 1_000_000 });

  await store.hit("scope:a", { windowMs: WINDOW });
  await store.hit("scope:a", { windowMs: WINDOW });

  assert.equal((await store.hit("scope:b", { windowMs: WINDOW })).count, 1);
});

test("the memory store starts a new window after the window ends", async () => {
  let clock = 1_000_000;
  const store = createMemoryStore({ now: () => clock });

  assert.equal((await store.hit("scope:a", { windowMs: WINDOW })).count, 1);

  clock += WINDOW;

  assert.equal((await store.hit("scope:a", { windowMs: WINDOW })).count, 1);
});

test("the memory store is per instance, which is the limitation of TD-06", async () => {
  const first = createMemoryStore({ now: () => 1_000_000 });
  const second = createMemoryStore({ now: () => 1_000_000 });

  await first.hit("scope:a", { windowMs: WINDOW });

  assert.equal((await first.hit("scope:a", { windowMs: WINDOW })).count, 2);
  assert.equal(
    (await second.hit("scope:a", { windowMs: WINDOW })).count,
    1,
    "a second instance does not see the count of the first"
  );
});

// ----------------------------------------------------------------- redis store

test("the redis store returns the total of the window", async () => {
  const client = createFakeRedis();
  const store = createRedisStore({ client, now: () => 1_000_000 });

  assert.equal((await store.hit("scope:abc", { windowMs: WINDOW })).count, 1);
  assert.equal((await store.hit("scope:abc", { windowMs: WINDOW })).count, 2);
});

test("the redis store issues one atomic call per hit", async () => {
  const client = createFakeRedis();
  const store = createRedisStore({ client, now: () => 1_000_000 });

  await store.hit("scope:abc", { windowMs: WINDOW });

  assert.equal(client.calls.length, 1, "one call, not INCR and PEXPIRE separately");
  assert.equal(client.calls[0].script, INCREMENT_SCRIPT);
  assert.equal(client.calls[0].keys.length, 1);
  assert.deepEqual(client.calls[0].args, [WINDOW]);
});

test("the script repairs an expiry only when the key has none", () => {
  // The expiry is keyed on the TTL and not on the count, so a key that lost
  // its expiry is repaired on the next hit instead of living forever.
  assert.match(INCREMENT_SCRIPT, /PTTL/);
  assert.match(INCREMENT_SCRIPT, /if ttl < 0 then/);
  assert.match(INCREMENT_SCRIPT, /PEXPIRE/);
  assert.equal(
    INCREMENT_SCRIPT.includes("count == 1"),
    false,
    "the guard must not be the counter value, which never returns to one"
  );
});

test("a later hit in the same window does not reset the window", async () => {
  const client = createFakeRedis();
  let clock = 1_000_000;
  const store = createRedisStore({ client, now: () => clock });

  await store.hit("scope:abc", { windowMs: WINDOW });
  const firstKey = client.calls[0].keys[0];

  clock += 10_000;
  await store.hit("scope:abc", { windowMs: WINDOW });

  const secondKey = client.calls[1].keys[0];

  assert.equal(
    firstKey,
    secondKey,
    "the same window must use the same key, so the count continues"
  );

  // The fake keeps the original expiry, mirroring the script.
  assert.equal(client.counters.get(firstKey).ttl, WINDOW);
});

test("the window identifier changes when the window ends", async () => {
  const client = createFakeRedis();
  let clock = 1_000_000;
  const store = createRedisStore({ client, now: () => clock });

  await store.hit("scope:abc", { windowMs: WINDOW });
  clock += WINDOW;
  await store.hit("scope:abc", { windowMs: WINDOW });

  assert.notEqual(
    client.calls[0].keys[0],
    client.calls[1].keys[0],
    "a stale counter must be unreachable, not merely expired"
  );
});

test("concurrent hits are all counted", async () => {
  const client = createFakeRedis();
  const store = createRedisStore({ client, now: () => 1_000_000 });

  const answers = await Promise.all(
    Array.from({ length: 10 }, () => store.hit("scope:abc", { windowMs: WINDOW }))
  );

  const counts = answers.map((answer) => answer.count).sort((a, b) => a - b);

  assert.deepEqual(counts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("a failing redis client rejects the hit", async () => {
  const failure = Object.assign(new Error("connection refused"), {
    code: "ECONNREFUSED",
  });

  const client = createFakeRedis({ failWith: failure });
  const store = createRedisStore({ client, now: () => 1_000_000 });

  await assert.rejects(
    () => store.hit("scope:abc", { windowMs: WINDOW }),
    /connection refused/
  );
});

test("a slow redis client times out", async () => {
  const client = createFakeRedis({ delayMs: 200 });
  const store = createRedisStore({
    client,
    now: () => 1_000_000,
    timeoutMs: 20,
  });

  await assert.rejects(
    () => store.hit("scope:abc", { windowMs: WINDOW }),
    (error) => {
      assert.equal(error.code, "RATE_LIMIT_TIMEOUT");
      return true;
    }
  );
});

test("an unusable answer from redis is refused", async () => {
  const client = createFakeRedis({ badAnswer: true });
  const store = createRedisStore({ client, now: () => 1_000_000 });

  await assert.rejects(
    () => store.hit("scope:abc", { windowMs: WINDOW }),
    (error) => {
      assert.equal(error.code, "RATE_LIMIT_BAD_ANSWER");
      return true;
    }
  );
});

// ------------------------------------------------------------------ limiter

test("the store limiter allows up to the limit and then blocks", async () => {
  const store = createMemoryStore({ now: () => 1_000_000 });
  const check = createStoreLimiter({
    limit: 2,
    windowMs: WINDOW,
    store,
    scope: "test",
  });

  assert.equal((await check("cadet-1")).allowed, true);
  assert.equal((await check("cadet-1")).allowed, true);

  const blocked = await check("cadet-1");

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("the store limiter keeps identities apart", async () => {
  const store = createMemoryStore({ now: () => 1_000_000 });
  const check = createStoreLimiter({
    limit: 1,
    windowMs: WINDOW,
    store,
    scope: "test",
  });

  assert.equal((await check("cadet-1")).allowed, true);
  assert.equal((await check("cadet-1")).allowed, false);
  assert.equal((await check("cadet-2")).allowed, true);
});

test("a store failure fails open and reports once", async () => {
  const events = [];
  const logger = createThrottledLogger({
    now: () => 1_000_000,
    report: (event) => events.push(event),
  });

  const failing = {
    name: "failing",
    async hit() {
      throw Object.assign(new Error("store down"), { code: "ECONNRESET" });
    },
  };

  const check = createStoreLimiter({
    limit: 1,
    windowMs: WINDOW,
    store: failing,
    scope: "check-in",
    logger,
  });

  const first = await check("cadet-1");

  assert.equal(first.allowed, true, "an outage must not block the caller");
  assert.equal(first.degraded, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "rate_limiter_unavailable");
  assert.equal(events[0].scope, "check-in");
});

test("the limiter never puts the raw identifier in the key", async () => {
  const seen = [];

  const recording = {
    name: "recording",
    async hit(key) {
      seen.push(key);
      return { count: 1, ttlMs: WINDOW };
    },
  };

  const check = createStoreLimiter({
    limit: 5,
    windowMs: WINDOW,
    store: recording,
    scope: "check-in",
  });

  await check("attendance-check-in:user_abc123");

  assert.equal(seen.length, 1);
  assert.equal(
    seen[0].includes("user_abc123"),
    false,
    "the identifier must be hashed, not stored in clear"
  );
  assert.match(seen[0], /^check-in:[0-9a-f]{16}$/);
});

test("the same identifier always maps to the same hashed key", () => {
  assert.equal(
    hashIdentifier("user_abc123"),
    hashIdentifier("user_abc123")
  );
  assert.notEqual(
    hashIdentifier("user_abc123"),
    hashIdentifier("user_xyz789")
  );
  assert.equal(hashIdentifier("user_abc123").length, 16);
});

// --------------------------------------------------------------- logging

test("logging is throttled to one line per scope per minute", () => {
  const events = [];
  let clock = 1_000_000;

  const logger = createThrottledLogger({
    throttleMs: 60_000,
    now: () => clock,
    report: (event) => events.push(event),
  });

  const error = Object.assign(new Error("down"), { code: "ECONNRESET" });

  assert.equal(logger.reportFailure("check-in", error), true);
  assert.equal(logger.reportFailure("check-in", error), false);
  assert.equal(logger.reportFailure("check-in", error), false);

  assert.equal(events.length, 1);
  assert.equal(logger.suppressed(), 2);

  clock += 60_000;
  assert.equal(logger.reportFailure("check-in", error), true);
  assert.equal(events.length, 2);
});

test("the throttle is kept per scope", () => {
  const events = [];
  const logger = createThrottledLogger({
    now: () => 1_000_000,
    report: (event) => events.push(event),
  });

  const error = new Error("down");

  logger.reportFailure("check-in", error);
  logger.reportFailure("records", error);

  assert.equal(events.length, 2, "a second scope is reported on its own");
  assert.deepEqual(events.map((event) => event.scope), ["check-in", "records"]);
});

// --------------------------------------------------------------- configuration

test("an absent configuration selects the memory store", () => {
  const config = readStoreConfig({});

  assert.equal(config.mode, MEMORY_STORE_NAME);
  assert.deepEqual(config.problems, []);
});

test("the kill switch selects the memory store", () => {
  const config = readStoreConfig({
    RATE_LIMIT_STORE: "memory",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token",
  });

  assert.equal(config.mode, MEMORY_STORE_NAME);
});

test("a complete configuration selects the redis store", () => {
  const config = readStoreConfig({
    RATE_LIMIT_STORE: "redis",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token",
  });

  assert.equal(config.mode, REDIS_STORE_NAME);
  assert.equal(config.url, "https://example.upstash.io");
  assert.deepEqual(config.problems, []);
});

test("a missing variable falls back to memory and is reported", () => {
  const config = readStoreConfig({ RATE_LIMIT_STORE: "redis" });

  assert.equal(config.mode, MEMORY_STORE_NAME);
  assert.equal(config.problems.length, 2);
  assert.match(config.problems.join(" "), /UPSTASH_REDIS_REST_URL/);
  assert.match(config.problems.join(" "), /UPSTASH_REDIS_REST_TOKEN/);
});

test("a malformed url falls back to memory", () => {
  const config = readStoreConfig({
    RATE_LIMIT_STORE: "redis",
    UPSTASH_REDIS_REST_URL: "not a url",
    UPSTASH_REDIS_REST_TOKEN: "token",
  });

  assert.equal(config.mode, MEMORY_STORE_NAME);
  assert.match(config.problems.join(" "), /not a URL/);
});

test("an unknown store name falls back to memory", () => {
  const config = readStoreConfig({ RATE_LIMIT_STORE: "postgres" });

  assert.equal(config.mode, MEMORY_STORE_NAME);
  assert.match(config.problems.join(" "), /not recognised/);
});

test("a degraded configuration builds a memory store and reports once", () => {
  const events = [];
  const logger = createThrottledLogger({
    now: () => 1_000_000,
    report: (event) => events.push(event),
  });

  const { store, mode, problems } = createStoreFromEnv(
    { RATE_LIMIT_STORE: "redis" },
    { logger, now: () => 1_000_000 }
  );

  assert.equal(mode, MEMORY_STORE_NAME);
  assert.equal(store.name, MEMORY_STORE_NAME);
  assert.ok(problems.length > 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].code, "RATE_LIMIT_CONFIG");
});

// ------------------------------------------------------------- compatibility

test("the existing synchronous limiter is unchanged", () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });

  assert.equal(limiter("cadet-1").allowed, true);
  assert.equal(limiter("cadet-1").allowed, true);

  const blocked = limiter("cadet-1");

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0);

  assert.equal(limiter("cadet-2").allowed, true);
});

test("the synchronous limiter returns an object, not a promise", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  const answer = limiter("cadet-1");

  assert.equal(typeof answer.then, "undefined", "the default path stays synchronous");
});

// ----------------------------------------------------------------- utilities

test("the window identifier groups an instant into a window", () => {
  assert.equal(windowIdFor(0, 1_000), 0);
  assert.equal(windowIdFor(999, 1_000), 0);
  assert.equal(windowIdFor(1_000, 1_000), 1);
  assert.equal(windowIdFor(1_999, 1_000), 1);
});

test("the seconds until the window ends are bounded", () => {
  assert.equal(secondsUntilWindowEnd(0, 60_000), 60);
  assert.equal(secondsUntilWindowEnd(30_000, 60_000), 30);
  assert.equal(secondsUntilWindowEnd(59_999, 60_000), 1);
});

// ------------------------------------------------- F4: expiry repair (TTL)

test("a key that lost its expiry is repaired on the next hit", async () => {
  const client = createFakeRedis();
  let clock = 1_000_000;
  const store = createRedisStore({ client, now: () => clock });

  // First hit: the key is created with the intended expiry.
  await store.hit("scope:abc", { windowMs: WINDOW });
  const key = client.calls[0].keys[0];

  assert.equal(client.counters.get(key).ttl, WINDOW);

  // A broken writer leaves the key without an expiry. The counter is already
  // above one, which is exactly the case the old `count == 1` guard missed.
  client.seedWithoutTtl(key, 4);

  clock += 1_000;

  const answer = await store.hit("scope:abc", { windowMs: WINDOW });

  assert.equal(
    client.counters.get(key).ttl,
    WINDOW,
    "the expiry must be restored, not left absent"
  );
  assert.equal(answer.ttlMs, WINDOW, "the caller is told the real window");
});

test("a repaired key does not stay permanent", async () => {
  const client = createFakeRedis();
  const store = createRedisStore({ client, now: () => 1_000_000 });

  await store.hit("scope:abc", { windowMs: WINDOW });
  const key = client.calls[0].keys[0];

  client.seedWithoutTtl(key, 9);

  await store.hit("scope:abc", { windowMs: WINDOW });

  const ttl = client.counters.get(key).ttl;

  assert.ok(ttl > 0, "a key without an expiry must never survive the repair");
});

test("normal hits do not extend an existing expiry", async () => {
  const client = createFakeRedis();
  let clock = 1_000_000;
  const store = createRedisStore({ client, now: () => clock });

  await store.hit("scope:abc", { windowMs: WINDOW });
  const key = client.calls[0].keys[0];
  const firstTtl = client.counters.get(key).ttl;

  // Time moves on inside the same window. A sliding window would push the
  // expiry forward; a fixed window must not.
  clock += 30_000;
  await store.hit("scope:abc", { windowMs: WINDOW });

  assert.equal(
    client.counters.get(key).ttl,
    firstTtl,
    "the fixed window must not become a sliding window"
  );
});

test("a zero ttl is reported as the whole window, never as zero", async () => {
  // A caller told to wait zero seconds would retry at once against a key that
  // is still over its limit.
  const client = { async eval() { return [999, 0]; } };
  const store = createRedisStore({ client, now: () => 1_000_000 });

  const answer = await store.hit("scope:abc", { windowMs: WINDOW });

  assert.equal(answer.count, 999);
  assert.equal(answer.ttlMs, WINDOW);
  assert.ok(answer.ttlMs > 0);
});

test("a negative ttl from the server is reported as the whole window", async () => {
  for (const ttl of [-1, -2]) {
    const client = { async eval() { return [5, ttl]; } };
    const store = createRedisStore({ client, now: () => 1_000_000 });

    const answer = await store.hit("scope:abc", { windowMs: WINDOW });

    assert.equal(answer.ttlMs, WINDOW, `ttl ${ttl} must not reach the caller`);
  }
});

test("the repaired script and the limiter agree on the retry time", async () => {
  const client = createFakeRedis();
  const store = createRedisStore({ client, now: () => 1_000_000 });

  const check = createStoreLimiter({
    limit: 10,
    windowMs: WINDOW,
    store,
    scope: "test",
  });

  // One real hit through the limiter, so the seeded key is exactly the key the
  // limiter computes (scope plus the hashed identifier).
  await check("cadet-1");
  const key = client.calls[0].keys[0];

  assert.match(key, /^rl:test:[0-9a-f]{16}:\d+$/);

  // The key loses its expiry and is already far above the limit.
  client.seedWithoutTtl(key, 50);

  const blocked = await check("cadet-1");

  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.equal(
    client.counters.get(key).ttl,
    WINDOW,
    "the expiry is repaired before the block is reported"
  );
});

// ------------------------------------- F7: observable memory fallback

function silentCollector() {
  const events = [];
  let clock = 1_000_000;

  const logger = createThrottledLogger({
    throttleMs: 60_000,
    now: () => clock,
    report: (event) => events.push(event),
  });

  return {
    events,
    logger,
    advance(ms) {
      clock += ms;
    },
  };
}

const REDIS_ENV = {
  RATE_LIMIT_STORE: "redis",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "a-token-value",
};

test("an explicit memory store is silent in production", () => {
  const { events, logger } = silentCollector();

  const result = createStoreFromEnv(
    { ...REDIS_ENV, RATE_LIMIT_STORE: "memory" },
    { logger, nodeEnv: "production" }
  );

  assert.equal(result.mode, MEMORY_STORE_NAME);
  assert.equal(result.explicit, true);
  assert.equal(
    events.length,
    0,
    "an operator who chose memory must not be warned"
  );
});

test("production without any configuration is reported", () => {
  const { events, logger } = silentCollector();

  const result = createStoreFromEnv({}, { logger, nodeEnv: "production" });

  assert.equal(result.mode, MEMORY_STORE_NAME);
  assert.equal(result.explicit, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].code, "RATE_LIMIT_MEMORY_FALLBACK");
  assert.match(events[0].message, /RATE_LIMIT_STORE is not set/);
});

test("production with an incomplete redis configuration is reported", () => {
  const { events, logger } = silentCollector();

  const result = createStoreFromEnv(
    { RATE_LIMIT_STORE: "redis" },
    { logger, nodeEnv: "production" }
  );

  assert.equal(result.mode, MEMORY_STORE_NAME);
  assert.ok(result.problems.length > 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].code, "RATE_LIMIT_CONFIG");
});

test("production with a valid redis configuration is not reported", () => {
  const { events, logger } = silentCollector();

  const result = createStoreFromEnv(REDIS_ENV, {
    logger,
    nodeEnv: "production",
  });

  assert.equal(result.mode, REDIS_STORE_NAME);
  assert.equal(result.explicit, true);
  assert.deepEqual(result.problems, []);
  assert.equal(events.length, 0);
});

test("local development on the memory store is silent", () => {
  const { events, logger } = silentCollector();

  const result = createStoreFromEnv({}, { logger, nodeEnv: "development" });

  assert.equal(result.mode, MEMORY_STORE_NAME);
  assert.equal(events.length, 0, "development must stay quiet");
});

test("a broken configuration is reported outside production too", () => {
  const { events, logger } = silentCollector();

  createStoreFromEnv({ RATE_LIMIT_STORE: "redis" }, {
    logger,
    nodeEnv: "development",
  });

  assert.equal(
    events.length,
    1,
    "an explicit request for redis that cannot be honoured is always reported"
  );
});

test("the production warning is throttled, not repeated per call", () => {
  const { events, logger, advance } = silentCollector();

  // A factory that is called per request must not write per request.
  for (let index = 0; index < 100; index += 1) {
    createStoreFromEnv({}, { logger, nodeEnv: "production" });
  }

  assert.equal(events.length, 1);

  advance(60_000);
  createStoreFromEnv({}, { logger, nodeEnv: "production" });

  assert.equal(events.length, 2, "one line per minute, not one per call");
});

test("the warning never carries a url or a token", () => {
  const { events, logger } = silentCollector();

  createStoreFromEnv(
    {
      RATE_LIMIT_STORE: "redis",
      UPSTASH_REDIS_REST_URL: "https://secret-host.upstash.io",
      // The token is missing, so the configuration is reported.
    },
    { logger, nodeEnv: "production" }
  );

  const printed = JSON.stringify(events);

  assert.equal(printed.includes("secret-host"), false, "no url in the log");
  assert.equal(printed.includes("a-token-value"), false, "no token in the log");
});

test("an unrecognised store name is reported and falls back to memory", () => {
  const { events, logger } = silentCollector();

  const result = createStoreFromEnv(
    { RATE_LIMIT_STORE: "postgres" },
    { logger, nodeEnv: "production" }
  );

  assert.equal(result.mode, MEMORY_STORE_NAME);
  assert.equal(result.explicit, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].code, "RATE_LIMIT_CONFIG");
});

test("the configured mode is exposed on the result", () => {
  const { logger } = silentCollector();

  const memory = createStoreFromEnv(
    { RATE_LIMIT_STORE: "memory" },
    { logger, nodeEnv: "production" }
  );

  const redis = createStoreFromEnv(REDIS_ENV, { logger, nodeEnv: "production" });

  assert.equal(memory.mode, MEMORY_STORE_NAME);
  assert.equal(redis.mode, REDIS_STORE_NAME);
  assert.equal(memory.store.name, MEMORY_STORE_NAME);
  assert.equal(redis.store.name, REDIS_STORE_NAME);
});

test("readStoreConfig distinguishes an explicit choice from a default", () => {
  assert.equal(readStoreConfig({}).explicit, false);
  assert.equal(readStoreConfig({ RATE_LIMIT_STORE: "memory" }).explicit, true);
  assert.equal(readStoreConfig({ RATE_LIMIT_STORE: "redis" }).explicit, true);
  assert.equal(readStoreConfig({ RATE_LIMIT_STORE: "  " }).explicit, false);
});

// ------------------------------------------------ deterministic timeouts

// withTimeout unrefs its timer so it cannot hold a serverless invocation open.
// A test therefore has to keep the event loop alive itself; relying on the
// unref'd timer to do it makes the test exit before the assertion runs.

function keepAlive() {
  const handle = setInterval(() => undefined, 1_000);
  return () => clearInterval(handle);
}

test("withTimeout resolves when the work finishes in time", async () => {
  const stop = keepAlive();

  try {
    const value = await withTimeout(
      Promise.resolve([3, 1_000]),
      1_000,
      () => new Error("must not happen")
    );

    assert.deepEqual(value, [3, 1_000]);
  } finally {
    stop();
  }
});

test("withTimeout rejects with the supplied error at the deadline", async () => {
  const stop = keepAlive();

  try {
    const never = new Promise(() => undefined);

    await assert.rejects(
      () =>
        withTimeout(never, 20, () =>
          Object.assign(new Error("deadline"), { code: "RATE_LIMIT_TIMEOUT" })
        ),
      (error) => {
        assert.equal(error.code, "RATE_LIMIT_TIMEOUT");
        return true;
      }
    );
  } finally {
    stop();
  }
});

test("a late rejection after the deadline does not leak", async () => {
  const stop = keepAlive();
  const leaks = [];

  const onLeak = (reason) => leaks.push(reason);
  process.on("unhandledRejection", onLeak);

  try {
    let rejectLate;
    const slow = new Promise((_resolve, reject) => {
      rejectLate = reject;
    });

    await assert.rejects(() =>
      withTimeout(slow, 20, () => new Error("deadline"))
    );

    // The abandoned call fails afterwards, which would be an unhandled
    // rejection if the race did not absorb it.
    rejectLate(new Error("late failure from the store"));

    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.deepEqual(leaks, [], "no unhandled rejection may escape");
  } finally {
    process.off("unhandledRejection", onLeak);
    stop();
  }
});

test("the store reports a timeout through the fail-open path", async () => {
  const stop = keepAlive();

  try {
    const events = [];
    const logger = createThrottledLogger({
      now: () => 1_000_000,
      report: (event) => events.push(event),
    });

    const slowClient = {
      async eval() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return [1, 60_000];
      },
    };

    const store = createRedisStore({
      client: slowClient,
      now: () => 1_000_000,
      timeoutMs: 20,
    });

    const check = createStoreLimiter({
      limit: 5,
      windowMs: 60_000,
      store,
      scope: "check-in",
      logger,
    });

    const answer = await check("cadet-1");

    assert.equal(answer.allowed, true, "a timeout fails open");
    assert.equal(answer.degraded, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].code, "RATE_LIMIT_TIMEOUT");
  } finally {
    stop();
  }
});

test("a timer that finished in time leaves nothing pending", async () => {
  const stop = keepAlive();

  try {
    for (let index = 0; index < 50; index += 1) {
      await withTimeout(Promise.resolve(index), 1_000, () => new Error("x"));
    }

    // If a timer were left behind the process would hold 50 pending handles.
    const handles = process._getActiveHandles?.() ?? [];
    const timers = handles.filter(
      (handle) => handle?.constructor?.name === "Timeout"
    );

    assert.ok(timers.length <= 2, `no timer may leak, found ${timers.length}`);
  } finally {
    stop();
  }
});
