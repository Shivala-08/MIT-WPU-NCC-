# TD-06 S2b — Redis Limiter Integration: Implementation Plan

**Status:** READ-ONLY PLAN — see §0 disclosure: three files already carry S2b-1
edits made in the *previous* turn, before this read-only instruction arrived.
No file was modified while producing this document.
**Branch:** `fix/auth-identity` @ `96987cf`
**Date:** 2026-11-13
**Autonomy:** Yellow — approval required before further edits.

---

## 0. Disclosure — pre-existing uncommitted S2b work

Before this plan was requested, a prior turn implemented **part of S2b** ("S2b-1").
This must be reviewed as part of the plan, not silently built upon.

| File | Current hash | Status |
|---|---|---|
| `src/lib/rate-limit.mjs` | `e0f2c988…` | **modified** — limiters now built by `createLimiterForScope` |
| `src/app/api/attendance/check-in/route.ts` | `18d14465…` | **modified** — 3× `await` |
| `src/app/api/admin/attendance/sessions/[id]/records/route.ts` | `8c02cfab…` | **modified** — 1× `await` |
| `src/lib/rate-limit.d.mts` | (updated) | union return type |

**What that work does:** each exported limiter is created once at module load.
If the environment selects `memory` (the default), it returns the *original*
synchronous `createRateLimiter`. Otherwise it returns the store-backed async
limiter. Call sites `await` the answer, which is harmless for a non-promise.

**Verified behaviour of the pre-existing edit (run this turn, read-only):**

```
default (no env): returns promise? false
default result: {"allowed":true,"remaining":19,"retryAfterSeconds":0}
```

So with no environment variable the system behaves exactly as before. `tsc`
clean, 88/88 rate-limit tests, 167/167 CI-suite pass, 3 pre-existing lint
warnings. **No per-IP limiter, no contact limiter, no manual-code change.**

**Decision needed:** accept this partial work as S2b-1, or revert it and plan
from scratch. This plan assumes it is **accepted**, and builds the remaining
halves on top.

---

## 1. Current state — verified facts

### 1.1 The four limiters

| Limiter | Limit | Window | Identity in key | Scope (new) | Call site | Async now? |
|---|---|---|---|---|---|---|
| `checkInLimiter` | 20 | 5 min | `attendance-check-in:${userId}` | `check-in` | `check-in/route.ts:25` | yes (pre-existing edit) |
| `manualCodeLimiter` | 10 | 10 min | `attendance-manual-code:${userId}` | `manual-code` | `check-in/route.ts:45` | yes |
| `manualCodeSessionLimiter` | 60 | 10 min | `attendance-manual-code-session:${sessionId}` | `manual-code-session` | `check-in/route.ts:68` | yes |
| `bulkMarkLimiter` | 30 | 60 s | `attendance-records:${userId}` | `records` | `records/route.ts:27` | yes |

`checkInLimiter` and `bulkMarkLimiter` run **immediately after `authorize()`**,
so `authz.user.id` is a verified server-side identity — never client-supplied.

### 1.2 Rejection response convention (already uniform)

```json
{ "error": "…", "retryAfterSeconds": <int> }   HTTP 429
```

All four sites already return this shape. **`Retry-After` header is NOT
currently sent** — only the JSON field.

### 1.3 The manual-code budget defect (unchanged, confirmed this turn)

`check-in/route.ts:64` — `manualCodeSessionLimiter` is called **only inside
`if (stored)`**, i.e. only when the submitted code hash already matches a stored
row. A **wrong guess never reaches it**, so `manualCodeSessionLimiter` protects
only against *reuse of a correct code*, not against guessing.

This is the central security item of S2b-2.

---

## 2. Security questions

### 2.1 How to obtain client IPs safely on Vercel

**Do not trust arbitrary forwarding headers.** `X-Forwarded-For` is a list an
attacker can prepend to. Taking `split(",")[0]` yields the *client-controlled*
value.

Verified: the repo has **no** existing IP handling (`grep` for
`x-forwarded-for|x-real-ip|request.ip` → 0 hits), and Next 16's bundled docs do
not document an IP accessor.

**Recommended strategy (defence in depth):**

1. **Primary — platform header.** On Vercel the trustworthy value is
   `x-vercel-forwarded-for` (set by the platform edge, overwriting client
   input). Where available it supersedes `x-forwarded-for`.
2. **Fallback — rightmost hop.** If only `x-forwarded-for` exists, take the
   **right-most** entry (the one appended by the nearest trusted proxy), not the
   left-most.
3. **Normalise.** Strip the port; for IPv6 truncate to the **/64** bucket, for
   IPv4 use the full address. This prevents a trivial bypass by rotating source
   ports.
4. **Fail safe.** If no trustworthy IP can be derived, **use a single shared
   bucket** (`ip-unknown`) rather than skipping the limit. A shared bucket is
   harsh but bounded; skipping is unbounded.
5. **Never log the raw IP.** Reuse `hashIdentifier` (already 16-hex chars).

**Open decision D1:** whether `x-vercel-forwarded-for` is present in this
project's Vercel configuration. This must be **confirmed on a preview deployment**
before relying on it; the plan must degrade gracefully if it is absent.

New module `src/lib/client-ip.mjs` encapsulates all of the above so no route
contains header-parsing logic.

### 2.2 Making wrong manual-code guesses consume the session budget

**The problem restated:** the session is unknown until the hash lookup succeeds,
so a per-session counter cannot be charged before the lookup.

**Recommended: charge a per-IP budget that does not require the session.**

| Budget | Key | Limit | Charged | Purpose |
|---|---|---|---|---|
| per user (existing) | `manual-code:<userId>` | 10 / 10 min | always | one account guessing |
| **per IP (new)** | `manual-code-ip:<ipHash>` | **30 / 10 min** | always, **before** the hash lookup | many accounts, one network |
| per session (existing) | `manual-code-session:<sessionId>` | 60 / 10 min | only on a correct hash | reuse of a correct code |

The per-IP limiter is placed **before** `prisma.attendanceManualCode.findUnique`,
so every attempt — right or wrong — consumes it. That is what makes failed
guesses irreversible.

**Why not simply move the session limiter earlier?** Impossible: the session id
is the unknown. Charging a session counter keyed on an unknown session would
create a bucket per guessed code — no aggregate protection.

**Open decision D2:** accept the per-IP limit (30/10 min) and the NAT
consequence — many cadets on campus wifi share an IP. 30 is chosen so a shared
network still allows a realistic number of genuine manual check-ins while
capping distributed guessing. This needs a real-traffic judgement from the unit.

### 2.3 Operational surfacing of fail-open

Already built in S2a/F7 and verified:

- `createStoreLimiter` returns `{ allowed: true, degraded: true }` on any store
  error — fail-open.
- `createThrottledLogger` emits **one** `rate_limiter_unavailable` line per
  scope per minute (verified: 1 000 failures → 1 line).
- `RATE_LIMIT_MEMORY_FALLBACK` / `RATE_LIMIT_CONFIG` emitted by
  `createStoreFromEnv` at construction.

**Gap to close in S2b-1 (small):** fail-open is only a log line. Recommend
setting a **response field or header** (`x-ratelimit-degraded: 1`) when
`degraded` is true, so a reviewer can observe it without reading logs. This is
**optional** and needs approval; it must not leak to unauthenticated callers.

### 2.4 Concurrency across separate serverless instances

With the memory store: **no protection across instances** — each instance holds
its own `Map`, and a burst spread over N instances gets N× the limit.

With Redis: the Lua script is atomic, so `INCR` is serialised server-side
across all instances. The fixed window is keyed by `windowId`, so every instance
computes the same key for the same window. Correct by construction.

**Residual:** the fixed-window boundary allows up to ~2× the limit in a short
burst spanning the boundary (e.g. 20 requests at t=299.9s and 20 at t=300.1s).
Accepted for S2b; sliding window was rejected in S2a for cost and semantics.

### 2.5 Redis unavailable or misconfigured

| Scenario | Behaviour | Observable |
|---|---|---|
| Redis down / 5xx | fail-open, request allowed | `rate_limiter_unavailable` (1/min/scope) |
| Redis timeout (>1.5 s) | fail-open | same, `code: RATE_LIMIT_TIMEOUT` |
| Bad answer | fail-open | `RATE_LIMIT_BAD_ANSWER` |
| `RATE_LIMIT_STORE=redis`, vars missing | memory store | `RATE_LIMIT_CONFIG` |
| Nothing configured, production | memory store | `RATE_LIMIT_MEMORY_FALLBACK` |
| Explicit `=memory` | memory store | silent (intentional) |

**Consequence to state plainly:** during a Redis outage the manual-code limits
are effectively the per-instance memory limits. If the deployment has no memory
fallback in that moment, protection is degraded — but check-in keeps working.
This trade-off (availability over strict enforcement) was approved in S2a.

### 2.6 Rollback path, accounting for redeploy

Environment changes on Vercel **require a new deployment** — they do not
mutate a running one. So:

| Path | Mechanism | Time | Reverts |
|---|---|---|---|
| **R1** | Vercel Instant Rollback to previous deployment | ~30 s | All code |
| **R2** | `RATE_LIMIT_STORE=memory` + redeploy | minutes | Store only |
| **R3** | Remove `UPSTASH_*` + redeploy | minutes | Store (degraded path) |
| **R4** | Revert 4 files + `npm uninstall @upstash/redis` | minutes | Code |

**R1 is the only fast path.** The design document previously described the env
flip as "no deploy" — **that was wrong and is corrected here.**

No schema change ⇒ no data rollback, ever.

### 2.7 Tests proving cross-instance behaviour

Unit tests **cannot** prove shared state — by design the memory store is
per-instance (an existing test asserts exactly that). Cross-instance proof needs:

| Test | Mechanism |
|---|---|
| **T-C1** | Spawn **two independent `node` child processes**, both pointed at a real Upstash instance, exhaust from A, assert B is blocked |
| **T-C2** | Two processes, different keys — assert independence (no global collision) |
| **T-C3** | Deploy preview, `curl` loop, confirm cold start does not reset the count |

T-C1/T-C2 require real credentials ⇒ **not runnable in CI without secrets**.
Recommend a `scripts/*.integration.mjs` guarded by an env var, skipped by
default, documented as a manual gate.

---

## 3. Per-limiter before/after behaviour

### 3.1 `checkInLimiter` — 20 / 5 min / `attendance-check-in:<userId>`

| Event | Before (memory) | After (Redis, configured) |
|---|---|---|
| Under limit | `{allowed:true, remaining:n}` | identical |
| Over limit | 429 + `retryAfterSeconds` | identical |
| Redis down | n/a | **fail-open**, allowed, log 1/min |
| Timeout | n/a | fail-open |
| Across instances | each instance 20 | **shared 20** |
| Status/body | `429 {error, retryAfterSeconds}` | **unchanged** |
| `Retry-After` header | not sent | **propose adding** (§4) |

### 3.2 `manualCodeLimiter` — 10 / 10 min / `<userId>`

Same table. **Critical property:** it runs *before* the hash lookup, so a wrong
guess already consumes it. No change needed to its placement.

### 3.3 `manualCodeSessionLimiter` — 60 / 10 min / `<sessionId>`

| | Before | After |
|---|---|---|
| Charged when | only on correct hash | unchanged |
| Cross-instance | per instance | **shared** |
| Placement fix | — | **stays as-is**; the new per-IP limiter covers guessing |

### 3.4 `bulkMarkLimiter` — 30 / 60 s / `<userId>`

Same as 3.1. Runs right after `authorize()` + `canManageSessions`, so the
identity is verified. **No change beyond the await already applied.**

### 3.5 New: `manualCodeIpLimiter` — 30 / 10 min / `ip:<ipHash>`

| Event | Behaviour |
|---|---|
| Under limit | proceeds to the existing flow |
| Over limit | **429** before any DB read |
| Redis down | fail-open (consistent with the others) |

---

## 4. `Retry-After` decision

Currently only `retryAfterSeconds` in the JSON body. **Recommendation: add the
standard `Retry-After` header** alongside it — HTTP-correct, useful to the
client, no behaviour regression.

```ts
{ status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
```

**Open decision D3.** Low risk, but it is an API-visible change.

---

## 5. Proposed implementation sequence

| Step | Content | Risk | Needs approval |
|---|---|---|---|
| **S2b-0** | Ratify or revert the pre-existing partial work (§0) | — | **Yes** |
| **S2b-1** | Finish wiring: per-limiter scopes already done; add `client-ip.mjs`; optional `x-ratelimit-degraded` | Medium | Yes |
| **S2b-2** | Add `manualCodeIpLimiter` **before** the hash lookup | **High** — check-in path | Yes |
| **S2b-3** | Add `Retry-After` header at the 4 (5) sites | Low | Yes |
| **S2b-4** | Tests: per-limiter 429s, IP normalisation, budget-consumption, fail-open | Low | Yes |
| **S2b-5** | Staging cross-instance verification (T-C1/T-C2) | — | Credentials |

`S2b-0` must come first: building on un-reviewed work is how a defect goes
unnoticed.

---

## 6. Exact files expected to change

| File | Step | Nature |
|---|---|---|
| `src/lib/rate-limit.mjs` | **already changed** | `createLimiterForScope` (§0) |
| `src/lib/rate-limit.d.mts` | **already changed** | union return type |
| `src/app/api/attendance/check-in/route.ts` | **already changed** (awaits) + S2b-2 | add IP limiter before hash lookup |
| `src/app/api/admin/attendance/sessions/[id]/records/route.ts` | **already changed** (await) | no further change |
| `src/lib/client-ip.mjs` | **new**, S2b-1 | proxy header trust + normalisation |
| `src/lib/client-ip.d.mts` | **new**, S2b-1 | declarations |
| `scripts/client-ip.test.mjs` | **new**, S2b-4 | header trust matrix |
| `scripts/manual-code-limits.test.mjs` | **new**, S2b-4 | wrong guesses consume IP budget |
| `scripts/rate-limit-integration.test.mjs` | **new**, S2b-5 | cross-process (env-gated, skipped by default) |

**Not changed:** `prisma/`, migrations, `next.config.ts`, `.env.example`,
`package.json`, `.github/workflows/ci.yml`, `src/lib/attendance-service.mjs`
(code generation / hashing / TTL / revocation), `src/app/api/contact/route.ts`.

---

## 7. Production prerequisites

### P1 — F3 keyed HMAC (required before production)

`hashIdentifier` is unkeyed SHA-256 truncated to 64 bits. With **per-IP keys
being introduced**, low-entropy identifiers (IPv4 = 2³² total) become
dictionary-attackable by anyone with keyspace read access.

**Integration point:** `src/lib/rate-limit.mjs:92` —
`const windowKey = \`${scope}:${hashIdentifier(key)}\`` — and
`src/lib/client-ip.mjs` when it hashes the IP.

**Required:** a new secret (`RATE_LIMIT_HASH_SECRET`), a keyed HMAC
implementation, and a decision on rotation (rotating invalidates in-flight keys
for ≤ 10 min — acceptable).

**This must ship with or before S2b-2**, because S2b-2 is what first puts
attacker-supplied, low-entropy values (IPs) into keys.

### P2 — Confirm the Vercel IP header (D1)
### P3 — Upstash account, free tier, credentials in Vercel (§2.6)
### P4 — Accept the NAT/shared-IP trade-off (D2)

---

## 8. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Missing `await` at a site → limit silently never applies | **High** | Already awaited 4 sites; add a test that each route returns 429 |
| R2 | Redis outage degrades manual-code protection | **High** | Accepted trade-off; log + monitor; per-IP still applies per-instance |
| R3 | Wrong IP derivation → trivially bypassable | **High** | `client-ip.mjs` with an explicit trust matrix + tests |
| R4 | Campus NAT blocks legitimate cadets | Medium | 30/10 min; monitor 429 volume after launch |
| R5 | Building on un-reviewed §0 work | Medium | S2b-0 gate first |
| R6 | Fixed-window boundary burst (2×) | Low | Documented; accepted |
| R7 | `Retry-After` changes API surface | Low | D3 approval |
| R8 | Truncated unkeyed hash + IPs | Medium | P1 before production |

---

## 9. Unresolved decisions

1. **D0** — Accept or revert the pre-existing S2b-1 edits (§0)?
2. **D1** — Is `x-vercel-forwarded-for` present in this deployment? Must be confirmed on preview.
3. **D2** — Accept per-IP manual-code limit of 30/10 min and the campus-NAT consequence?
4. **D3** — Add the `Retry-After` header?
5. **D4** — Emit `x-ratelimit-degraded` on fail-open, or logs only?
6. **D5** — F3 keyed HMAC ships **with** S2b-2, or later (accepting IP-hash exposure)?
7. **D6** — Who owns the Upstash account and secret rotation?

---

## 10. Confirmation

- **No file was created or modified while producing this plan.**
- Git state at time of writing: **modified 56, untracked 87, staged 0** — identical
  to the state at the start of this planning turn.
- The three modified files listed in §0 were changed in a **previous** turn,
  before the read-only instruction. They are disclosed, not hidden.
- No dependency, environment file, schema, migration, or CI file was touched.
- No staging, commit, push, merge, deploy, reset, clean, or discard was performed.

---

**END OF PLAN — awaiting approval. S2b implementation not started.**
