# TD-06 S2a — Final Security Review

**Status:** READ-ONLY FINDINGS REPORT — no file modified, no dependency or environment
changed, no Git operation performed, no production access.
**Scope:** the S2a code only (`src/lib/rate-limit.mjs`, `src/lib/rate-limit-store.mjs`,
`src/lib/rate-limit.d.mts`, `scripts/rate-limit-store.test.mjs`).
**Date:** 2026-11-13

Every claim below was produced by reading the code or by executing a throwaway probe
against the real modules (probes were deleted afterwards; the working tree is unchanged).

---

## 0. Summary table

| # | Finding | Severity | Verdict |
|---|---|---|---|
| F1 | `createStoreFromEnv` is **never called** — no production path can reach Redis | **P1 — Design** | Blocks S2b; must be wired deliberately |
| F2 | Kill switch is **not** read at request time; it is construction-time only | **P2** | Correct as designed, but must be documented |
| F3 | `hashIdentifier` is unkeyed SHA-256 truncated to 64 bits | **P2 — Security** | Recommend keyed HMAC before production |
| F4 | `INCR` succeeding while `PEXPIRE` fails can leave a **permanent key** | **P2 — Correctness** | Real; propose atomic fix |
| F5 | Timed-out Redis calls **continue in the background**; `unref()` weakens the timeout outside a server | **P2** | Bounded, but document + test |
| F6 | Late rejections are correctly absorbed — **no unhandled rejection leak** | **PASS** | Verified |
| F7 | Missing/malformed env **silently** falls back to memory with a **console-only** warning | **P1 — Ops** | No deployment can be proven to be on Redis |
| F8 | Per-scope log throttle works; amplification bounded by scope count (currently 4) | **PASS** | Verified |
| F9 | Several edge cases have **no tests** (PTTL ≤ 0, withTimeout, env→redis construction) | **P2 — Coverage** | List in §6 |

---

## 1. Kill switch

### 1.1 Is `RATE_LIMIT_STORE=memory` read only at process initialization?

**Yes — construction time, not request time.**

Evidence: `readStoreConfig` is called only from `createStoreFromEnv`
(`rate-limit.mjs:157`). Nothing calls `createStoreFromEnv` per request; it is a
factory. So the value is read when the store object is built — once per process
(or once per module evaluation).

An important consequence, and the reason F1 matters:

> **At present the kill switch has no effect at all**, because
> `createStoreFromEnv` is never called. The four exported limiters
> (`checkInLimiter`, `manualCodeLimiter`, `manualCodeSessionLimiter`,
> `bulkMarkLimiter`) are still created with `createRateLimiter` — the pure
> in-memory implementation (`rate-limit.mjs:186,193,198,203`).

That is correct for S2a's stated boundary ("do not change the four existing call
sites to async yet"), but it means **the S2a code is currently dead in
production**. It cannot be switched on by an environment variable today. This
must be understood as "foundation only", not "deployed protection".

### 1.2 Does changing a Vercel environment variable require a new deployment?

**Yes.** Vercel injects environment variables into the build and the runtime
bundles; changing one does not mutate a running deployment. A new deployment is
required for the new value to be present.

Practically this means: **the kill switch is not an instant rollback.** Flipping
`RATE_LIMIT_STORE` to `memory` requires a rebuild and redeploy. Vercel's
**Instant Rollback** to a previous deployment is the faster path.

### 1.3 Accurate rollback procedure

Because the current code is not wired, the honest procedure today is trivial.
Once S2b wires it, the procedure becomes:

| Step | Action | Time | Effect |
|---|---|---|---|
| R1 | Vercel → Deployments → previous good → **Instant Rollback** | ~30 s | Restores prior code, reverts wiring entirely |
| R2 | Set `RATE_LIMIT_STORE=memory` and redeploy | few min | Code stays, store reverts to memory |
| R3 | Remove `UPSTASH_*` vars and redeploy | few min | `readStoreConfig` returns memory mode with `problems` logged |
| R4 | Revert the two lib files + `npm uninstall @upstash/redis` | few min | Full code rollback |

**Do not describe R2 as instant.** R1 is the only fast path.

---

## 2. Identifier hashing

### 2.1 Code under review

```js
export function hashIdentifier(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}
```

### 2.2 Evaluation of SHA-256 truncation

- Takes the **first 64 bits** (16 hex chars) of a SHA-256 digest.
- Deterministic and collision-resistant enough for a rate-limit key (birthday
  bound ≈ 2³² keys before a collision is likely — far above the number of users).
- **Not reversible** in the cryptographic sense.

### 2.3 Dictionary attack assessment

The inputs are **not secret but are low-entropy and structured**:

- CUIDs (`usr_abc123…`) — high entropy, not guessable. Low risk.
- Session ids — same.
- **IP addresses** — *very* low entropy. The entire IPv4 space is 2³². A
  precomputed table of all IPv4 hashes is trivial to build.
- A small user base (a single NCC unit) means student emails / roll numbers, if
  ever used as identifiers, are highly guessable.

So: an attacker who obtains a **Redis keyspace dump** (or Upstash console access)
could reverse IPv4-derived keys by brute force in seconds, and could confirm a
suspected user id cheaply for the first 64 bits.

**Risk is real but conditional** — it requires read access to the keyspace. It is
not exploitable from the internet.

### 2.4 Recommendation: use a keyed HMAC

**Yes, HMAC is appropriate and should be adopted before the store goes live.**

```js
// proposed, NOT implemented
import { createHmac } from "node:crypto";
export function hashIdentifier(value, secret) {
  return createHmac("sha256", secret).update(String(value)).digest("hex").slice(0, 16);
}
```

- Secret from a new env var (e.g. `RATE_LIMIT_HASH_SECRET`), reused from
  `AUTH_SECRET` only if a dedicated secret is refused.
- Rotating the secret invalidates all in-flight keys — acceptable, since keys
  expire within one window (≤ 10 min).
- Without the secret a dump is useless, which removes the dictionary attack.

**Do not change code now** — this is noted for S2b approval.

---

## 3. Redis expiry

### 3.1 Code under review

```lua
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { count, ttl }
```

### 3.2 What happens if `INCR` succeeds but `PEXPIRE` fails?

The key exists with **no expiry**. On the next request `count` becomes 2, so
`count == 1` is **false** and `PEXPIRE` is **never retried**. The key is
**permanent** and the counter only ever grows: every subsequent hit in every
future window… no — the window id is part of the key, so a *new* window gets a
*new* key. The damaged key simply never expires and accumulates forever.

### 3.3 Can keys become permanent? — **Yes**

Confirmed by probe:

| Simulated answer | `hit()` returns | Reality in Redis |
|---|---|---|
| `[1, -1]` (PTTL = no expiry) | `{count:1, ttlMs:60000}` | **Key has no TTL** |
| `[1, -2]` (key vanished) | `{count:1, ttlMs:60000}` | Key absent/expired |

The `ttlMs` fallback (`Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs`) makes
the **caller** believe the window is healthy. The leak is completely invisible
from the application. Over months this is unbounded memory growth in Redis.

Note: inside a single Lua script `PEXPIRE` failing after a successful `INCR` is
rare — script execution is atomic and a script error would surface. The realistic
path to a permanent key is **an `INCR` from an older code path** (or a manual
`SET`) without a TTL, not a mid-script failure. The `count == 1` guard is what
makes any such key unrecoverable.

### 3.4 Proposed safe atomic solution

Make the expiry unconditional and idempotent, and verify the TTL afterwards:

```lua
local count = redis.call("INCR", KEYS[1])
-- Always (re)assert the expiry. Redis docs: PEXPIRE on a key that already has
-- a TTL updates it; on a key with none it adds one. This removes the
-- "INCR succeeded, PEXPIRE skipped" window entirely.
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
```

Trade-off to decide: unconditional `PEXPIRE` turns the window into a **sliding
window** (each hit extends the expiry), which is a **different limiting
semantics** than the fixed window approved for S2a. The version above avoids
that by only fixing a *missing* TTL while leaving an existing TTL alone — it
preserves fixed-window behaviour **and** guarantees no permanent key.

**Recommendation:** adopt the `PTTL < 0` repair variant. It is atomic, keeps
fixed-window semantics, and makes a permanent key self-healing on the next hit.
Also add a `TTL` guard test (§6).

---

## 4. Timeout and outage behaviour

### 4.1 Code under review

`withTimeout()` races the store promise against a `setTimeout`. The timer is
`unref()`'d so it does not hold the process open.

### 4.2 Do timed-out operations continue in the background? — **Yes**

Verified by probe:

```
1. raced rejected with: RATE_LIMIT_TIMEOUT
2. underlying promise resolved AFTER abandonment: true
```

`Promise.race` **does not cancel** the losing promise. The underlying Redis HTTP
call keeps running to completion (or to its own abort). The application simply
stops waiting.

### 4.3 Mitigation that does exist

`createRedisClient` passes `signal: () => AbortSignal.timeout(timeoutMs)` to the
Upstash client, and the library honours a per-request `signal`
(`error-4e36-PC0.d.ts:55`). So with the **real client** the HTTP request *is*
aborted at roughly the same moment. The abandoned work is therefore bounded to
about one timeout, not unbounded.

The caveat: this is only true for clients built by `createRedisClient`. A
hand-injected client (as in tests) has no signal, so the "continues in
background" behaviour is fully visible there.

### 4.4 Concurrency and resource implications during an outage

- Each in-flight request holds **one pending HTTP connection** for up to
  `timeoutMs` (1 500 ms default).
- Under a Redis outage on a serverless platform, concurrency is bounded by the
  function's own concurrency limit, not by the limiter. The limiter adds at most
  one socket per concurrent request for ≤ 1.5 s.
- **No retries** (`retry: { retries: 0 }`) — correct choice: a retry would
  multiply the cost and delay the fail-open decision.
- **Risk:** a sustained outage at high traffic means many sockets to a dead
  endpoint. This is a platform-level concern, not a correctness bug.

### 4.5 The `unref()` caveat — a real testing hazard

My first probe **hung and exited early** because the only pending timer was
`unref()`'d, so Node had nothing keeping the event loop alive and terminated
before the timeout fired:

```
Warning: Detected unsettled top-level await
```

Inside a serverless function this is harmless (the platform keeps the request
alive). But it means **a unit test that relies on `withTimeout` without a
keep-alive will flake or silently pass**. Any new timeout test must hold the
event loop open.

### 4.6 Logging behaviour under sustained failure — **PASS**

Verified by probe:

| Scenario | Log lines |
|---|---|
| 1 000 failed requests in one minute, one scope | **1** (+999 suppressed) |
| 500 **concurrent** failures, one scope | **1** |
| 50 **distinct** scopes | **50** |

The throttle is correct and concurrency-safe in practice (single-threaded JS).
Amplification is bounded by the number of distinct scopes — currently 4, plus
`config`. That is an acceptable ceiling.

**Minor:** the logged event includes `suppressedSinceLastReport`, which is
genuinely useful. It does **not** log the key or identifier — correct.

---

## 5. Redis configuration

### 5.1 Verification matrix (all confirmed by the existing test suite)

| Input | Result | Warning |
|---|---|---|
| nothing set | memory | **none** (`problems: []`) |
| `RATE_LIMIT_STORE=memory` | memory | none (correct — explicit) |
| `RATE_LIMIT_STORE=redis`, both vars | redis | none |
| `RATE_LIMIT_STORE=redis`, vars missing | memory | `problems` ×2 → logged once |
| `RATE_LIMIT_STORE=redis`, bad URL | memory | "not a URL" → logged once |
| `RATE_LIMIT_STORE=postgres` | memory | "not recognised" → logged once |

The parsing is defensive: never throws, trims, lower-cases, validates URL shape.

### 5.2 Can production silently remain on memory? — **Yes, in one case**

The dangerous case is **`RATE_LIMIT_STORE` unset entirely** (the default). That
returns memory mode with `problems: []`, so `createStoreFromEnv` logs **nothing**.

Consequence: a deployment with no Redis configuration looks exactly like a
correctly configured memory deployment. There is **no observable signal** that
the shared store is absent.

Additionally — and more importantly — **F1 means production is on memory
regardless of configuration today.**

### 5.3 Recommendation

1. **Warn on unconfigured memory in production.** Suggested rule: if
   `NODE_ENV === "production"` and mode is memory and `problems` is empty, log
   `rate_limiter_memory_fallback` once. Explicit `RATE_LIMIT_STORE=memory`
   should stay silent (it is a deliberate choice).
2. **Expose the mode.** A tiny `/api/health` field or a boot log line stating
   `rate_limiter_store=<mode>` gives an operator one thing to check.
3. **Treat `problems` as an alert**, not just a log: any non-empty `problems` in
   production should be visible in monitoring, not buried in function logs.

---

## 6. Test coverage — gaps and recommendations

### 6.1 Gaps found (grep-verified as untested)

| Area | Missing test |
|---|---|
| PTTL ≤ 0 handling | `ttlMs` fallback when Redis reports no expiry (`-1`) or missing key (`-2`) |
| Permanent keys | A key with no TTL must be repaired on the next hit (depends on the §3.4 fix) |
| `withTimeout` directly | No direct unit test: resolves before deadline, rejects at deadline, clears timer |
| Timer cleanup | `withTimeout` must not leave a pending timer (would keep the process alive) |
| Late rejection | The losing promise rejecting after the deadline must not leak an unhandled rejection |
| Env → **redis** construction | `createStoreFromEnv` is tested only for the *memory fallback*; the positive Redis branch is never exercised |
| `hashIdentifier` input types | non-string input, empty string, very long string |
| Unicode / very long keys | a 10 KB identifier must still yield a 16-char key |
| Negative/zero window | `windowMs = 0` — division by zero in `windowIdFor` |
| Clock regression | `now()` going backwards (NTP step) must not throw |
| `limit = 0` | must block on the first hit, not allow |
| Logger state | `suppressed()` reset after a report |

### 6.2 Recommended additional deterministic tests

```js
// 1. PTTL -1 (no expiry) is surfaced, not masked
fake.eval = async () => [1, -1];
assert.equal((await store.hit("k", { windowMs: 60000 })).ttlMs, 60000);

// 2. after the §3.4 fix, a key with no TTL is repaired
fake.eval = async () => [2, -1];
// the script must have issued PEXPIRE on a later hit

// 3. withTimeout resolves normally when the work is fast
assert.deepEqual(await withTimeout(Promise.resolve([1,2]), 50, fail), [1,2]);

// 4. withTimeout rejects with the supplied error at the deadline
await assert.rejects(withTimeout(new Promise(()=>{}), 10, () => mk("TO")), /TO/);

// 5. no timer leak: process must exit without a keep-alive
//    (assert by running the timeout path in a child process that exits 0)

// 6. late rejection is absorbed — no unhandledRejection fires
//    (this probe was run manually; make it a test)

// 7. the positive env branch builds a redis store
const { mode, store } = createStoreFromEnv(
  { RATE_LIMIT_STORE: "redis",
    UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "t" },
  { logger: silentLogger }
);
assert.equal(mode, "redis");
assert.equal(store.name, "redis");

// 8. limit = 0 blocks the very first request
// 9. windowMs = 0 is rejected or treated as one window (define behaviour)
// 10. hashIdentifier("") is stable and 16 chars; a 10 KB input is 16 chars
```

### 6.3 Note on test #5 and the `unref()` hazard

Test #5 must run the timeout path in a **child process** and assert it exits 0
without a keep-alive; an in-process test cannot distinguish "timer cleared" from
"timer unref'd".

---

## 7. Consolidated findings

### P1 — must be resolved before the store is switched on

**F1. The shared store is unreachable from production code.**
`createStoreFromEnv` has no caller; the four exported limiters remain
`createRateLimiter` (memory). S2a is a foundation only.
*Evidence:* `grep -rn createStoreFromEnv src/` → one hit, the definition itself;
`rate-limit.mjs:186,193,198,203` are all `createRateLimiter`.
*Fix:* S2b wires it. Until then no documentation should claim shared limiting.

**F7. No observable warning when production runs on memory.**
*Evidence:* `readStoreConfig({})` → `{mode:"memory", problems:[]}`; nothing logs.
*Fix:* production-only `rate_limiter_memory_fallback` log + expose the mode.

### P2 — should be resolved before production traffic

**F3. Unkeyed truncated SHA-256 is dictionary-attackable for low-entropy ids (IPs).**
*Fix:* keyed HMAC with a dedicated secret (§2.4).

**F4. A key whose TTL is missing can become permanent and is never repaired.**
*Evidence:* `[1,-1]` probe → caller sees a normal 60 000 ms window while Redis
holds a key with no expiry; `count == 1` guard prevents any later `PEXPIRE`.
*Fix:* `PTTL < 0` repair inside the same atomic script (§3.4).

**F5. Timed-out operations continue in the background.**
*Evidence:* probe 1–2. Bounded by the client's `AbortSignal` in production, but
unbounded for injected clients. Also causes the `unref()` testing hazard (§4.5).
*Fix:* document; test the abort wiring; hold the event loop in timeout tests.

**F2. Kill switch is construction-time only and needs a redeploy.**
*Fix:* document accurately; rely on Vercel Instant Rollback for fast recovery.

**F9. Coverage gaps in §6.1.**
*Fix:* add the ten tests in §6.2.

### PASS

- **F6** No unhandled rejection leak from abandoned promises (verified).
- **F8** Log throttling correct under load and concurrency; no key/identifier in logs.
- Atomic `INCR`-then-conditional-`PEXPIRE` is genuinely atomic as one script.
- Window id in the key makes stale counters unreachable.
- `retry: { retries: 0 }` is the right choice for fail-open latency.
- Configuration parsing never throws and is fully covered for the failure paths.

---

## 8. Recommended order for S2b

1. Fix **F4** (PTTL repair) — smallest, highest correctness value, no API change.
2. Fix **F7** (production memory warning + expose mode).
3. Adopt **F3** (keyed HMAC) — needs one new env var and an owner decision.
4. Wire **F1** (`createStoreFromEnv` → the four limiters, async) together with the
   call-site `await` migration.
5. Add the **F9** tests.
6. Document **F2**/**F5** behaviour in the operator notes.

---

**END OF REPORT.** No source file, dependency, environment variable or Git state
was altered. The four probe scripts used for verification were deleted; the
working tree matches its state before this review.
