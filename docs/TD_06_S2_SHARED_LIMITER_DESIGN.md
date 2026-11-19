# TD-06 S2 — S1 Final Review + Shared Rate Limiter Design

**Status:** READ-ONLY DESIGN REPORT — nothing modified, installed, configured or deployed.
**Branch inspected:** `fix/auth-identity` @ `96987cf` (working tree preserved)
**Date:** 2026-11-13
**Autonomy:** **Yellow** — every change below needs owner approval before implementation.

---

# Part A — Final S1 Review

| # | Item | Verdict |
|---|---|---|
| A1 | Streaming body-size enforcement and reader cleanup | **PASS** (with one note) |
| A2 | Content-Type handling | **FAIL** |
| A3 | Email validation edge cases | **PASS** (with one note) |
| A4 | Zod compatibility and frontend response contract | **PASS** |
| A5 | Reproducible automated tests | **PASS** |
| A6 | Remaining security / regression issues | **PASS with findings** |

## A1 — Streaming enforcement and reader cleanup — PASS

Verified in `src/lib/http-body.mjs:46–73`:

```
46:  const reader = body.getReader();
61:    total += value.byteLength;
63:    if (total > maxBytes) {
66:      await reader.cancel().catch(() => undefined);
```

- Bytes are counted **as they arrive**, so enforcement is during the read.
- `reader.cancel()` is called on exceeding the limit, and the rejection is
  swallowed so the original 413 surfaces.
- `Content-Length` is only an early fast-path rejection — the real gate is the loop.
- The `!body` fallback (`req.arrayBuffer()`) reads unbounded but the resulting
  buffer is length-checked **after** — this is a genuine memory spike risk, not
  a bypass of the *rejection*, but a bypass of the *streaming* property. Marked
  as finding F1 below.

**Note (not a failure):** `reader.releaseLock()` is never called. Node releases
the lock when the reader is garbage-collected; on an aborted request this can
hold a microtask longer than ideal. Harmless in practice, worth a comment.

## A2 — Content-Type handling — **FAIL**

`src/app/api/contact/route.ts` contains **no** `content-type` check (grep for
`content-type` returns 0 matches). The route accepts any body that parses as
JSON regardless of declared type — `text/plain`, `application/x-www-form-urlencoded`,
or a missing header all succeed if the bytes happen to be valid JSON.

Impact is low (the 8 KB cap and field validation bound the damage), but it
**is** a gap: the approved scope implicitly assumed JSON-only input, and a
cross-site form POST with `enctype=text/plain` can deliver a JSON-looking body
without a CORS preflight.

**Recommendation:** reject requests whose `content-type` is not
`application/json` (allow an `application/json; charset=utf-8` suffix) with
**415**. This is the one item I would fix before closing S1.

## A3 — Email validation edge cases — PASS

`isPlausibleEmail` (`contact-validation.mjs:75–110`) checks, in order: length ≤
254, no whitespace, exactly one `@` at index > 0, non-empty local and domain,
domain contains `.`, domain does not start or end with `.`.

Verified accepted: `cadet@example.edu`, `first.last@mitwpu.edu.in`,
`a+tag@example.co.in`, `c_1@example.org`.
Verified rejected: `no-at-sign`, `@example.edu`, `cadet@`, `cadet@example`,
`two@at@example.edu`, `space in@example.edu`, `cadet@.edu`, `cadet@example.`.

**Note (not a failure):** ordering is length-check first at line 145, then
shape at line 166, so an over-length address yields the length message rather
than the shape message. That is the better user-facing order.
Genuinely exotic-but-valid addresses (quoted local parts, IP-literal domains)
are rejected. That is an acceptable trade for a contact form.

## A4 — Zod compatibility and frontend contract — PASS

- `zod` no longer appears in the route (grep count **0**); `contact-validation.mjs`
  fully replaces it for this endpoint. Zod remains a dependency used elsewhere —
  **not removed**, no dependency change.
- Minimum lengths preserved exactly: `name` ≥2, `subject` ≥3, `message` ≥10
  (`contact-validation.mjs:155`).
- Frontend contract intact: `ContactClient.tsx:41–42` reads `res.ok` and
  `data.error`; the route still returns `{ error }` on failure and
  `{ success, messageId }` with **201** on success.
- Behaviour change to note: values are now **trimmed** before storage, and
  unknown fields are **discarded** rather than stripped. Both are strict
  improvements; both are behaviour changes and were declared in the S1 report.

## A5 — Reproducible automated tests — PASS

`scripts/contact-validation.test.mjs`, 17 tests, **17/17 pass**, no database,
no network, no server. Verified this session. Covers valid submission, per-field
over-max (all four), at-max boundaries, missing/wrong-type/blank/non-object,
minimums, email shape, and three body-size scenarios including **no
Content-Length** and a **misleading Content-Length**.

**Gap:** there is no test asserting the **route** returns 415 for a wrong
content type, because the route has no such behaviour yet (see A2). There is
also no route-level test that the prisma error path returns a generic 500
message; validation-level coverage is strong, route-level coverage is thin.

## A6 — Remaining security / regression issues — PASS with findings

| ID | Finding | Severity | Status |
|---|---|---|---|
| F1 | `!body` fallback reads unbounded before length-checking | Low | Streaming property lost only when `req.body` is null (rare). Rejection still correct. |
| F2 | No Content-Type enforcement (A2) | Low–Medium | **Should fix before closing S1** |
| F3 | `reader.releaseLock()` not called | Info | Cosmetic |
| F4 | No route-level test for 413/500 mapping | Low | Covered at module level; route glue untested |
| F5 | Rate limiting still absent | **P1 — by design** | This is TD-05's remaining half; S1 explicitly excluded it |

**No regression found.** Valid submissions return 201 with the same shape;
existing attendance, profile, and auth suites are untouched and 167/167 pass.

**S1 verdict: PASS, with the recommendation to add Content-Type enforcement
(415) as a small follow-up before declaring TD-05 complete.**

---

# Part B — S2 Architecture

## B.0 Current state (verified)

`src/lib/rate-limit.mjs` — module-scope `const hits = new Map()`. Contract:
`check(key)` → `{ allowed, remaining, retryAfterSeconds }`, **synchronous**.

| Limiter | Limit | Window | Key | Call site |
|---|---|---|---|---|
| `checkInLimiter` | 20 | 5 min | `attendance-check-in:<userId>` | `check-in/route.ts:25` |
| `manualCodeLimiter` | 10 | 10 min | `attendance-manual-code:<userId>` | `check-in/route.ts:45` |
| `manualCodeSessionLimiter` | 60 | 10 min | `attendance-manual-code-session:<sessionId>` | `check-in/route.ts:68` |
| `bulkMarkLimiter` | 30 | 60 s | `attendance-records:<userId>` | `records/route.ts:27` |

Deployment: Vercel, no `vercel.json`, default maxDuration. Automatic scale-out
means the `Map` is per-instance and lost on cold start.

## B.1 Atomic increment and expiry — avoiding GET-then-SET

**Do not** read a counter, compare, then write it back. Two instances can both
read `9`, both allow, and both write `10` — a classic lost update.

**Recommended: fixed-window counter with `INCR` + `PEXPIRE` in one pipeline.**

```
WINDOW_ID = floor(now / windowMs)
key        = rl:{name}:{identity}:{WINDOW_ID}
count      = INCR key          # atomic, server-side
if count == 1: PEXPIRE key windowMs   # set TTL only on creation
allowed    = count <= limit
retryAfter = windowMs - (now % windowMs)   # deterministic, no extra read
```

Why this is correct:

- `INCR` is **single-threaded and atomic** in Redis. No race, no lost update.
- `PEXPIRE` is issued only when `count == 1`, so the TTL is never reset by later
  increments (a common bug that turns a sliding window into an infinite counter).
- The window id is in the key, so **expiry is a memory-hygiene measure, not a
  correctness measure**. Even if `PEXPIRE` were lost, the next window uses a
  different key and the old one expires on its own.
- `retryAfterSeconds` is computed **without an extra round trip** (`windowMs -
  (now % windowMs)`), keeping the hot path to one Redis call.

Atomicity must be preserved by sending `INCR` and `PEXPIRE` in a **single
pipeline** (one round trip, ordered) — not two sequential awaits. If a pipeline
is unavailable, `MULTI/EXEC` or a Lua script is the fallback.

**Alternative considered and rejected: sliding window log.** Accurate but stores
one entry per request (`ZADD`/`ZREMRANGEBYSCORE`/`ZCARD`), costs more memory and
round trips, and changes the semantics callers already rely on. Fixed window is
what the current `Map` implements; matching it keeps behaviour comparable.

**Sliding-window alternative offered as an option,** not the default: Redis
`ZSET` of timestamps, `ZREMRANGEBYSCORE` + `ZCARD` + `ZADD` in one pipeline. It
removes the fixed-window burst edge (up to 2× the limit across a boundary) at
roughly 3× the command cost. Owner should choose; **recommend fixed window** to
match today's semantics and keep the code simple.

## B.2 Key design and per-endpoint limits

```
rl:{scope}:{identity}:{windowId}
```

| Scope | Identity | Limit | Window | Rationale |
|---|---|---|---|---|
| `check-in` | userId | 20 | 5 min | unchanged |
| `manual-code` | userId | 10 | 10 min | unchanged |
| `manual-code-session` | sessionId | 60 | 10 min | unchanged (see Part C) |
| `records` | userId | 30 | 60 s | unchanged |
| `contact` | **IP** | 5 | 15 min | new, part of TD-05 but **applied by S2's store** |

Rules:

- **Never interpolate raw user input into a key.** userId and sessionId are
  CUIDs — safe. IPs are attacker-controlled: normalise (strip port, map IPv6 to
  a /64 bucket) and, if the host does not guarantee the proxy header, treat the
  derivation as best-effort.
- Prefix `rl:` allows a single `SCAN`-based audit and avoids colliding with any
  future key namespace.
- Keep the existing limit numbers **unchanged** in S2. Changing a limit and
  changing the store in one step makes a regression impossible to attribute.

## B.3 Can all four call sites migrate to async `check()`? — Yes

The three call sites are all `await`-able because they already live inside
`async` route handlers (`POST`). The changes are mechanical:

```ts
// before
const limit = checkInLimiter(`attendance-check-in:${authz.user.id}`);
// after
const limit = await checkInLimiter(`attendance-check-in:${authz.user.id}`);
```

Four one-line edits, no control-flow change. **Caveat:** the manual-code and
session limiters are evaluated *inside* the `try` block already, so a throwing
store is caught by the existing `serviceErrorResponse` path — acceptable, but
see B.5 (fail-open must be handled in the limiter, not by the route's catch).

**Backward-compatibility option:** export both a sync-compatible
`memoryLimiter` (today's exact behaviour) and the async store-backed limiter,
selected by `createRateLimiter({ store })`. Tests keep using the memory store
synchronously; production uses Redis asynchronously. This avoids editing the
existing passing test at `attendance-rules.test.mjs:573`.

## B.4 Dependency and environment variables

| Item | Value | Notes |
|---|---|---|
| Dependency | `@upstash/redis` (^1.x) | HTTP/REST client, no native build, serverless-safe, small |
| `UPSTASH_REDIS_REST_URL` | server-only | e.g. `https://<name>.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | server-only | opaque; **never** `NEXT_PUBLIC_*` |

No CSP change (server-side only). No `vercel.json` change. No Prisma change —
this is why Redis beats the database option: the migration chain is currently
blocked by TD-01/02/03 and must not be extended.

Free tier: comfortably sufficient for a campus NCC unit's traffic.

## B.5 Fail-open during outages — logging and monitoring

**Recommendation: fail-open, with loud, structured logging.**

```
try   → INCR pipeline → decide
fail  → log once per N seconds: { event:"rate_limiter_unavailable", scope, error }
      → allow the request
```

Rationale: a Redis outage must not stop cadet check-in during a parade.
Availability beats strict enforcement for this application.

Anti-pattern to avoid: logging **every** failed request during an outage. That
turns a 1-minute Redis blip into a log flood and can itself cause an incident.
Use a coarse throttle (one log line per scope per minute).

Monitoring signals to emit (console-based; no new service):
- `rate_limiter_unavailable` — store unreachable
- `rate_limiter_degraded` — store slow (latency > threshold)
- `rate_limit_triggered` — 429 served (count only, no key contents)

**Do not log the key or identity value** — keys contain userIds and IPs.

## B.6 Test strategy with an injectable fake store

Store contract (small, so a fake is trivial):

```js
// store.hit(key, windowMs) -> { count, ttlMs }
//   memoryStore  : Map-based, matches today's semantics
//   redisStore   : INCR + PEXPIRE pipeline
//   failingStore : always throws (outage tests)
//   slowStore    : resolves after a delay (timeout tests)
```

New suite `scripts/rate-limit-store.test.mjs` (CI-safe, no network):

1. limit allows exactly `limit` calls, then blocks
2. distinct keys are independent
3. **two independent store instances do not share budget** (proves the memory
   store is per-instance — the TD-06 bug, asserted as a documented property)
4. window rollover resets the count
5. `retryAfterSeconds` is > 0 and ≤ `windowMs/1000` when blocked
6. `redisStore` calls `INCR` then `PEXPIRE` **only on count === 1**
7. `redisStore` issues **one pipeline**, not two round trips (assert call shape
   against a stub client)
8. `failingStore` → fail-open allows, and logs exactly once per throttle window
9. `slowStore` past timeout → fail-open allows
10. malformed env config → falls back to memory store and logs

## B.7 Outage, timeout, malformed configuration

| Scenario | Behaviour | Detection |
|---|---|---|
| Redis unreachable | fail-open, allow, log once/min | `rate_limiter_unavailable` |
| Redis slow (> timeout) | fail-open after `timeout` | `rate_limiter_degraded` |
| Env vars absent | memory store fallback + **startup warning** | log at boot |
| Env vars malformed (bad URL) | same as absent; constructor throws caught at module init | log at boot |
| Redis auth error (401) | fail-open + error log | `rate_limiter_unavailable` |
| Redis returns non-integer `INCR` | treat as unavailable, fail-open | error log |

Timeout: the Upstash client takes a per-request timeout; set it well below the
Vercel function limit (recommend ~1–2 s) so a hung Redis cannot consume the
whole function budget.

## B.8 Backward compatibility and rollback

| Step | Rollback |
|---|---|
| Add `@upstash/redis` | `npm uninstall @upstash/redis` |
| `rate-limit.mjs` gains `createRateLimiter({ store })`, keeps `memoryStore` default | restore file from git (<1 min) |
| 4 call sites gain `await` | revert 4 lines |
| Env vars removed | automatic fallback to `memoryStore` = today's exact behaviour |

**Kill switch:** an env flag `RATE_LIMIT_STORE=memory|redis` lets production
revert without a code change. Recommend shipping this — it converts "rollback"
from a deploy into a config toggle.

No schema change anywhere ⇒ no migration rollback ever required.

---

# Part C — Manual-code brute-force protection

## C.1 The exact gap (verified)

`src/app/api/attendance/check-in/route.ts`:

```
45:  const codeLimit = manualCodeLimiter(`attendance-manual-code:${authz.user.id}`)   // always runs
...
57:  const stored = await prisma.attendanceManualCode.findUnique({ where: { codeHash: ... } })
...
64:  if (stored) {
68:    const sessionLimit = manualCodeSessionLimiter(`...:${stored.sessionId}`)        // ONLY if stored
```

**The per-session budget is only consumed when the submitted code hash already
matches a stored row.** A wrong guess never reaches line 68. Therefore
`manualCodeSessionLimiter` protects only against repeated use of a *correct*
code, not against guessing.

Combined with `manualCodeLimiter` at 10 per 10 min per user, an attacker with
one account gets 10 guesses / 10 min. With *n* accounts the aggregate is
*n*×10 per 10 min against a shared 10⁶ space, with **no per-session ceiling
until a guess is correct.**

## C.2 How to make failed guesses consume the session budget

The session is the unit of attack (one open session, one 6-digit code). The
budget must therefore be keyed on the session, and it must be charged **before**
the hash lookup.

Two options:

**Option C-1 (recommended, no service change): charge by user, and add an
in-route pre-charge on the session once the session is known.**

The problem: the session is unknown until the hash lookup succeeds — we cannot
key on a session we have not identified.

Resolution — **charge a per-attempt budget that does not require knowing the
session**, and keep the per-session counter as a secondary ceiling:

| Budget | Key | Limit | Charged when |
|---|---|---|---|
| Per user | `attendance-manual-code:<userId>` | 10 / 10 min | always (already correct) |
| **Per IP** | `manual-code-ip:<normalisedIp>` | **30 / 10 min** | always — closes the many-accounts vector |
| Per session | `manual-code-session:<sessionId>` | 60 / 10 min | only when the hash matches (unchanged) |

The per-IP limiter is the piece that actually closes brute force from many
accounts on one network, and it needs no session knowledge.

**Option C-2 (stronger, small service change):** add a global
`manual-code-global` counter (e.g. 300 / 10 min) that counts **all** failed
manual-code attempts across the installation. A correct guess clears it. This
gives a hard ceiling regardless of how many accounts or IPs attack, at the cost
of a shared budget that a determined attacker could exhaust to temporarily
lock out legitimate manual check-in (a denial-of-service trade-off). Recommend
**C-1 first**, C-2 only if the owner accepts that trade-off.

## C.3 Do 404 and 410 reveal unnecessary information?

Current responses in `checkInWithManualCode`:

| Condition | Status | Message |
|---|---|---|
| Malformed (not 6 digits) | **400** | "The check-in code is not valid" |
| No matching hash | **404** | "The check-in code is not valid" |
| Session not OPEN | **409** | "This session is not open for check-in" |
| Revoked | **410** | "The check-in code was revoked" |
| Expired | **410** | "The check-in code expired" |

**Yes, this leaks.** A 404 vs 410 distinction tells an attacker "a code with
this exact value exists but has expired" — confirming they guessed a real code.
Given a 10⁶ space, learning that a value was *ever* issued is meaningful.

Note the messages for 400 and 404 are already identical; only the **status
codes** differ. That is the leak.

**Recommendation:** return **the same status and message for "no such code" and
for "expired/revoked"** — e.g. 404 with "The check-in code is not valid" for all
three. Keep 409 (session not open) and 400 (malformed) distinct because they do
not leak code existence and are genuinely useful to a legitimate cadet.

**Caution — this is a behaviour change for the mobile/QR client if it branches
on 410.** Must be approved and the client checked before changing.

## C.4 Per IP, per session, or both?

**Both, plus per user.** Each covers a different attacker shape:

| Key | Stops | Limit |
|---|---|---|
| per user | one account guessing | 10 / 10 min (unchanged) |
| **per IP** | many accounts from one network | **30 / 10 min (new)** |
| per session | repeated use of one correct code | 60 / 10 min (unchanged) |

Per-session alone cannot stop guessing (C.1). Per-IP alone is defeated by
distributed sources. Per-user alone is defeated by account proliferation.

**Recommended: per user (existing) + per IP (new).** Per-session stays as the
secondary ceiling.

**IP-derivation caveat:** on Vercel, use the platform-provided client IP. Never
trust a raw `X-Forwarded-For` first hop from an arbitrary client. Campus NAT
means many cadets share one IP — hence an IP limit **higher** than the per-user
limit so legitimate shared-network use is not blocked.

## C.5 Do existing session/window checks remain intact? — Yes

`checkInWithManualCode` order is unchanged: format → hash lookup → session OPEN
→ not revoked → not expired → `assertCheckInWindow`. The added IP limiter is a
pure pre-check that returns 429 before any of them. No legitimate path is
weakened: a first attempt from a fresh IP is always allowed, and the existing
20/5min `checkInLimiter` already runs first.

---

# Part D — Recommendation

## D.1 Proposed architecture

```
route handler
  └─ await limiter(key)                    ← one line changes
       └─ createRateLimiter({ scope, limit, windowMs, store })
            ├─ memoryStore  (default; tests + local + kill switch)
            └─ redisStore   (production)
                 └─ pipeline: INCR rl:{scope}:{id}:{windowId} ; PEXPIRE (if count==1)
                 └─ on error/timeout → fail-open + throttled log
```

Ship in three approved sub-steps:

| Sub | Content | Dependency | Risk |
|---|---|---|---|
| **S2a** | `rate-limit.mjs` gains injectable store + `redisStore`; `memoryStore` default; `RATE_LIMIT_STORE` kill switch; tests | `@upstash/redis` | Low |
| **S2b** | 4 call sites gain `await`; limits unchanged | none | **Medium** (check-in path) |
| **S2c** | Apply limiter to `POST /api/contact` by IP (completes TD-05) | none | Low |

**Also recommended as S1 follow-up (S1b):** enforce `Content-Type: application/json`
→ **415** (Part A finding A2).

## D.2 Exact files expected to change

| File | Sub | Nature |
|---|---|---|
| `src/lib/rate-limit-store.mjs` *(new)* | S2a | `memoryStore`, `redisStore`, `createRedisStore`, fail-open wrapper |
| `src/lib/rate-limit-store.d.mts` *(new)* | S2a | declarations (project convention) |
| `src/lib/rate-limit.mjs` | S2a | add `store` option; keep 4 exports and sync `memoryStore` path |
| `src/app/api/attendance/check-in/route.ts` | S2b | 3× `await`; **add per-IP limiter** (Part C) |
| `src/app/api/admin/attendance/sessions/[id]/records/route.ts` | S2b | 1× `await` |
| `src/app/api/contact/route.ts` | S2c, S1b | limiter by IP; content-type 415 |
| `src/lib/client-ip.mjs` *(new)* | S2b | normalise platform IP header |
| `src/lib/attendance-service.mjs` | C.3 | uniform 404 for no-code/expired/revoked (**behaviour change — needs approval**) |
| `package.json`, `package-lock.json` | S2a | `@upstash/redis` |
| `.env.example` | S2a | 2 new names + `RATE_LIMIT_STORE` |
| `scripts/rate-limit-store.test.mjs` *(new)* | S2a | store contract, fail-open, config fallback |
| `scripts/contact-rate-limit.test.mjs` *(new)* | S2c | 429 by IP; no insert on 429 |
| `scripts/manual-code-limits.test.mjs` *(new)* | C | per-IP budget; failed guesses consume budget |

**Not changed:** `prisma/`, migrations, `src/lib/guard.ts`, `src/lib/auth.ts`,
`next.config.ts` (no CSP change needed), `.github/workflows/ci.yml`.

## D.3 Proposed Redis key structure

```
rl:{scope}:{identity}:{windowId}

rl:check-in:usr_abc123:2938471
rl:manual-code:usr_abc123:2938471
rl:manual-code-ip:203.0.113.0_64:2938471
rl:manual-code-session:ses_xyz789:2938471
rl:records:usr_abc123:2938471
rl:contact:203.0.113.0_64:2938471
```

`windowId = floor(now / windowMs)`. No raw PII beyond ids already in the DB and
IPs truncated to a /64 or /32 bucket. TTL = `windowMs` so keys self-expire.

## D.4 Atomic operation strategy

One pipeline per check:

```
INCR   rl:{scope}:{identity}:{windowId}
PEXPIRE rl:{...} {windowMs}     # executed only when INCR returned 1
```

- Single round trip; ordering guaranteed by the pipeline.
- No read-modify-write in application code.
- Fallback if pipelines unavailable: `MULTI/EXEC`, or a Lua script doing both
  under one atomic step.
- `retryAfterSeconds` computed locally from `windowMs - (now % windowMs)` —
  no extra read, no clock dependence on Redis.

## D.5 Proposed environment variables

| Name | Scope | Required | Fallback |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | server | production | memory store + warning |
| `UPSTASH_REDIS_REST_TOKEN` | server | production | memory store + warning |
| `RATE_LIMIT_STORE` | server | optional | `memory` |

No `NEXT_PUBLIC_*`. No CSP change. No `vercel.json`.

## D.6 Test cases

Store/limiter (`rate-limit-store.test.mjs`): the 10 cases in B.6, all CI-safe.
Contact (`contact-rate-limit.test.mjs`): 429 after N from one IP; distinct IPs
independent; **no `prisma.create` on the 429 path**; IP bucket normalisation.
Manual code (`manual-code-limits.test.mjs`): failed guesses consume the per-IP
budget; a valid code still succeeds inside budget; per-user limit still 10;
session limit still 60; uniform 404 for no-code/expired/revoked.
Regression: existing `attendance-rules.test.mjs:573` must still pass — kept by
defaulting to `memoryStore`.

**Cannot be proven locally:** cross-instance sharing. TD-06's real acceptance
criterion needs **two processes against one real Upstash instance** — a staging
test, not a unit test. Must be stated plainly in the change record.

## D.7 Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `await` missed at one call site → limit silently never applied | **High** | `check()` returns a Promise; TypeScript flags `.allowed` on a Promise. Add a test asserting each route awaits. |
| Redis outage blocks check-in | **High** | Fail-open + kill switch |
| Fail-open silently erodes protection | Medium | Startup warning when store is memory in production |
| Adding 415 breaks a non-browser client | Low | Only the web form posts to `/api/contact`; verify before shipping |
| Uniform 404 breaks a client branching on 410 | Medium | Check client; needs approval |
| Per-IP limit too tight behind campus NAT | Medium | Set 30 (> per-user 10); monitor 429 volume |
| Global counter allows DoS (Option C-2) | Medium | Not adopted by default |
| Log flood during outage | Medium | Throttle to 1 line/scope/minute |
| PII in logs | Medium | Never log keys or IPs verbatim |

## D.8 Deployment and rollback sequence

1. Ship **S2a** with `RATE_LIMIT_STORE=memory` — code present, behaviour identical.
2. Add Upstash creds; flip `RATE_LIMIT_STORE=redis` on a **preview** deployment.
3. Staging: two-process test proving shared limits.
4. Flip production to `redis`; watch `rate_limiter_unavailable`.
5. Ship **S2b** (awaits + per-IP) — the security gain.
6. Ship **S2c** (contact limiter) — completes TD-05.
7. Ship **S1b** (415 content type) — closes Part A finding A2.

**Rollback at any step:** set `RATE_LIMIT_STORE=memory` (config toggle, no
deploy). Full rollback: revert files + `npm uninstall @upstash/redis`. Vercel
instant rollback covers everything at once. **No data or schema rollback is ever
needed.**

## D.9 Decisions requiring owner approval

1. **Fixed window (recommended) vs sliding window** — cost vs boundary accuracy.
2. **Approve `@upstash/redis`** and an Upstash account (free tier).
3. **Fail-open confirmed?** (recommended) and the kill-switch variable name.
4. **Per-IP limiter for manual code** — approve the 30/10min value and IP
   derivation from the Vercel header.
5. **Uniform 404** for no-code / expired / revoked — approve the behaviour change
   (C.3) and confirm no client depends on 410.
6. **Optional global counter (C-2)** — accept or reject the DoS trade-off.
7. **S1b content-type 415** — approve as a S1 follow-up.
8. **Sequencing** S2a → S2b → S2c, with S1b either before or after.
9. Who owns the Upstash account and secret rotation.

---

**END OF REPORT — no files were created or modified in producing this document,
other than this report itself. No dependency installed, no configuration
changed, no production access, nothing staged or committed.**
