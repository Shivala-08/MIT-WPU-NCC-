# TD-05 / TD-06 — Abuse Protection Implementation Plan

**Status:** READ-ONLY PLAN — no code changed, no dependency installed, no configuration altered.
**Author:** implementation planning pass
**Date:** 2026-11-13
**Branch inspected:** `fix/auth-identity` @ `96987cf`
**Autonomy tier:** **Yellow** — both items require approval before any edit.

> This document is a plan, not an implementation record. Nothing described here
> has been executed. Every claim below was verified by reading the working tree
> during this pass; see §1 for the exact evidence.

---

## 0. Scope

| Item | Register title | Severity | Why it is in scope |
|---|---|---|---|
| **TD-05** | Contact form unthrottled | P1 | No rate limit, no CAPTCHA on a public unauthenticated write endpoint |
| **TD-06** | Rate limiter process-local | P1 | `new Map()` cannot be trusted across serverless instances |

They are planned together because **TD-05's fix depends on TD-06's outcome**.
Applying the current limiter to `/api/contact` without fixing TD-06 would create
a second false sense of protection.

---

## 1. Current architecture — verified findings

### 1.1 Contact form (`src/app/api/contact/route.ts`)

```
POST /api/contact  →  public, no auth
  ├─ req.json()                      (no size limit)
  ├─ contactSchema.parse(body)       (Zod: name/email/subject/message)
  └─ prisma.contactMessage.create()  → row inserted unconditionally
```

Verified facts:

| Fact | Evidence |
|---|---|
| No rate limiting | grep for `rateLimit\|limiter\|turnstile\|captcha` in the file returns **0** |
| No CAPTCHA | no Turnstile import, no token field in schema |
| No body size cap | `await req.json()` is unbounded; attendance routes use `readJsonBody(req, 8_000)` but contact does not |
| Validation only | `contactSchema` — `name` ≥2, `email` valid, `subject` ≥3, `message` ≥10. **No upper bounds on any field** |
| No honeypot / timing check | none present |
| Storage is permanent | `ContactMessage` has `id, name, email, subject, message, isRead, createdAt` — no TTL, no cleanup job, no dedupe unique constraint |
| Public by design | no `authorize()` call — this is **correct** for a contact form and must not be changed |

Note the asymmetry: `src/app/api/attendance/check-in/route.ts` already uses
`readJsonBody(req, 8_000)`, so the bounded-read helper exists and is proven.
Contact simply does not use it.

### 1.2 Rate limiter (`src/lib/rate-limit.mjs`)

The file states its own limitation in its header comment:

> "The limits are per process. A deployment with more than one instance needs a
> shared store before the limits can be trusted across instances."

Implementation: a module-scope `const hits = new Map()`. Exported limiters:

| Limiter | Limit | Window | Key | Call site |
|---|---|---|---|---|
| `checkInLimiter` | 20 | 5 min | `attendance-check-in:<userId>` | `api/attendance/check-in/route.ts:23` |
| `manualCodeLimiter` | 10 | 10 min | `attendance-manual-code:<userId>` | `api/attendance/check-in/route.ts:45` |
| `manualCodeSessionLimiter` | 60 | 10 min | `attendance-manual-code-session:<sessionId>` | `api/attendance/check-in/route.ts:63` |
| `bulkMarkLimiter` | 30 | 60 s | `attendance-records:<userId>` | `api/admin/attendance/sessions/[id]/records/route.ts:27` |

The contract is a single synchronous function `check(key)` returning
`{ allowed, remaining, retryAfterSeconds }`. **All four call sites already
ignore how the limiter is built** — they only call `check(key)`. This is the
key architectural fact that makes TD-06 cheap: the public contract can stay
identical.

One deviation to note: `manualCodeSessionLimiter` is incremented **only when a
submitted code already matches a stored row** (`route.ts` looks up
`stored` first, then limits). That means the per-session limit does not consume
budget for wrong guesses. Combined with the per-user limit of 10 per 10 min, a
single account still gets 10 guesses per 10 minutes; the session limiter caps
*distributed* guessing only after a hash actually collides.

### 1.3 Six-digit manual code protection

| Property | Value | Assessment |
|---|---|---|
| Code space | 10⁶ (000000–999999) | Brute-forceable |
| Generation | `randomInt(0, 1_000_000)` — CSPRNG, not time-derived | **Good** |
| Storage | HMAC-SHA256 with server pepper, `codeHash` unique | **Good** |
| Pepper | `ATTENDANCE_CODE_SECRET` → `AUTH_SECRET` → `NEXTAUTH_SECRET`, min 16 chars, throws 500 if missing | **Good** |
| TTL | `DEFAULT_MANUAL_CODE_TTL_MINUTES` | **Good** |
| Revocation | `revokedAt` checked | **Good** |
| Session state | must be `OPEN` | **Good** |
| Window | `assertCheckInWindow` before/after bounds | **Good** |
| Enumeration signal | invalid code → **404**, expired/revoked → **410**, not-open → **409** | **Distinguishable** — an attacker can tell "code exists but expired" (410) from "no such code" (404) |
| Attempt limiting | per-user 10/10min, per-session 60/10min | **Weakened by TD-06** |

The distinguishing 404 vs 410 response is a minor information leak but is
**not** in TD-05/TD-06 scope; it is recorded here so it is not lost.

The real risk is arithmetic: with a 10⁶ space and 10 attempts per 10 minutes
per account, one account needs ~10⁵ windows (~1.9 years) to exhaust the space —
acceptable. But on Vercel, the `Map` resets on cold start and is not shared, so
**each concurrent instance grants a fresh 10-attempt budget**. If the platform
runs *k* instances, an attacker's effective budget is up to *k*×  the intended
one, and the stated limits are not the enforced limits.

### 1.4 Deployment architecture

| Fact | Evidence |
|---|---|
| Host | **Vercel** — `.vercel/project.json` exists with `projectId`, `orgId`, `projectName` |
| Runtime | Next.js serverless functions (App Router route handlers) |
| Database | PostgreSQL via `DATABASE_URL` (Prisma) |
| No `vercel.json` | no custom regions, no cron jobs, no function `maxDuration` overrides |
| No container/Processfile markers | no Dockerfile, no Procfile, no fly/railway config |

**Serverless consequences that drive the whole design:**

1. **No durable process memory.** Every cold start begins with an empty `Map`.
2. **Horizontal scale-out is automatic.** There is no single process to hold state.
3. **No long-lived background worker** unless a Vercel Cron is added
   (needs `vercel.json`, which currently does not exist).
4. **Global state must live in an external store** — database, Redis, or a
   managed KV. This is exactly what TD-06's own header comment predicts.
5. Function **cold start latency** rules out heavy per-request setup (so a
   pooled Redis client should be created once per module scope, reused across
   warm invocations).

### 1.5 Existing tests

| Suite | Covers | In CI? |
|---|---|---|
| `scripts/attendance-rules.test.mjs:573` | `createRateLimiter` — blocks above limit, independent keys, `retryAfterSeconds > 0` | **Yes** (CI-safe set) |
| `scripts/module-syntax.test.mjs:78` | asserts `rate-limit` module parses | **Yes** |
| `scripts/attendance-api.test.mjs` | API surface — **no 429 / rate-limit assertions found** | **No** (not in CI workflow) |
| Contact form | **No test file exists at all** | — |

Coverage gaps:
- No test asserts a **contact** request is rejected on repetition.
- No test injects a **second limiter store** to prove instance-independence.
- No test covers the `Map` reset / cold-start scenario.
- `attendance-api.test.mjs` does not assert 429 behaviour despite the routes returning it.

---

## 2. Abuse scenarios and risk assessment

Scoring: **Impact** (what breaks) × **Likelihood** (how easy once public).

| # | Scenario | Vector | Impact | Likelihood | Rating |
|---|---|---|---|---|---|
| A1 | **Contact-form flood** | `for` loop POSTing `/api/contact` | Unlimited `ContactMessage` rows → DB storage growth, inbox unusable, real messages buried | Trivial (one `curl` loop) | **High** |
| A2 | **Oversized payload** | 10 MB `message` string | Row bloat; possible function memory pressure; slow queries on admin inbox | Trivial | **High** |
| A3 | **Junk-content spam** | Automated submissions with valid Zod input | Inbox unusable; admin time wasted | Trivial | **High** |
| A4 | **Email-harvesting probe** | Automated with disposable addresses | No direct harm to system; reputational | Moderate | Low |
| A5 | **Manual-code brute force (single instance)** | 10 req / 10 min per account | Space exhaustion ~1.9 years — acceptable | Low | Low |
| A6 | **Manual-code brute force (multi-instance)** | Same, but budget resets per cold start / per instance | Effective budget inflated by instance count; 10⁶ space becomes materially reachable if *k* is large or attacker cycles cold starts | Requires knowing deployment shape | **Medium–High** |
| A7 | **Distributed code guessing across accounts** | Many cadet accounts, each 10/10min | Per-session limiter (60/10min) is the only aggregate defence, and it does not consume budget for misses | Moderate | **Medium** |
| A8 | **Rate-limit bypass by cold-start cycling** | Each new lambda invocation gets a fresh `Map` | All four limiters weakened; QR check-in and bulk-mark also affected | Requires traffic pattern knowledge | **Medium** |
| A9 | **QR token replay** | Captured token reused within window | **Out of scope** — duplicate detection exists (`result.duplicate`); not a TD-05/06 issue | — | — |

### Risk narrative

A1–A3 are the **urgent** ones. They need no account, no knowledge of the system,
and no serverless insight — a single `curl` loop against a public URL. A2 is
especially cheap because the current Zod schema has **no maximum length**, so
every large payload is accepted and stored.

A6–A8 are the reason TD-06 must be resolved *before or together with* TD-05.
Today's limiter is honest about being local, but once TD-05 places a limiter on
a public route, an unshared store means the new protection is weaker than its
numbers imply. Shipping TD-05 on the current `Map` would be **worse than
shipping nothing**: it produces a 429 response that satisfies a test while
providing little real protection in production.

A7 deserves emphasis: `manualCodeSessionLimiter` only increments after a code
hash **matches**, so wrong guesses never consume the per-session budget. The
per-session limiter therefore does not do the aggregate job its comment claims.

---

## 3. Recommended implementation options

Three tiers, cheapest first. **Recommendation is Option B**, described in §3.4.

### 3.1 Option A — Database-backed limiter (no new infrastructure)

Use the PostgreSQL database already present.

- New model `RateLimitHit { key, windowStart, count }` with a unique index on
  `(key, windowStart)`, or a sliding-row model mirroring current semantics.
- `check(key)` becomes **async**; call sites must `await`.
- Cleanup: opportunistic delete of expired windows, or a Vercel Cron.

| Aspect | Assessment |
|---|---|
| New dependency | **None** |
| New service | **None** — reuses `DATABASE_URL` |
| Cost | Free at current scale |
| Effort | Medium — 4 call sites become `await`; Prisma migration required (**schema change → needs approval**) |
| Correctness across instances | **Yes** — single source of truth |
| Extra DB round-trip per guarded request | Yes (~1–3 ms) |
| Failure mode | DB down ⇒ limiter down; must fail **open** or **closed** deliberately |

### 3.2 Option B — Upstash Redis via HTTP (recommended)

The roadmap already names Upstash (line 13, A17).

- `@upstash/redis` (HTTP/REST, designed for serverless — no TCP pool needed).
- Implement `createRateLimiter({ limit, windowMs, store })` where `store` is an
  injectable interface; ship `memoryStore` (current behaviour, default for tests)
  and `redisStore`.
- Keep `check(key)` **synchronous** by making Redis the *async* fast path only
  where required — see §3.4 for the exact contract decision.

| Aspect | Assessment |
|---|---|
| New dependency | `@upstash/redis` (**one**, small, no native build) |
| New service | Upstash Redis |
| Cost | **Free tier is sufficient**: Upstash free plan includes a generous
  monthly command allowance; a contact form at campus scale is far below it |
| Effort | Low–medium |
| Correctness across instances | **Yes** |
| Latency | ~1–5 ms per call (HTTP, same-region ideally) |
| Failure mode | Upstash unreachable ⇒ must decide fail-open vs fail-closed |

### 3.3 Option C — Turnstile CAPTCHA for TD-05 only

Cloudflare Turnstile, server-side siteverify, free.

- Adds a widget to the contact form and a hidden token field.
- Server verifies token via `https://challenges.cloudflare.com/turnstile/v0/siteverify`
  with `TURNSTILE_SECRET_KEY`.
- **Requires:** new network call, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
  `TURNSTILE_SECRET_KEY`, and a **CSP change** (`script-src` + `frame-src`
  must allow `https://challenges.cloudflare.com`).
- Free, no cost.

| Aspect | Assessment |
|---|---|
| Stops A1–A3 how | Blocks scripted/automated submissions outright |
| Effort | Medium — client widget, server verify helper, CSP edit, tests |
| Accessibility risk | Invisible/managed mode is low-friction; must not break the form if CF is down |
| Dependency | None (plain `fetch`) |

### 3.4 Recommended combination

**Do it in three separately-approved steps**, because they have different
dependency and configuration footprints:

| Step | Content | New dep | New service | Tier |
|---|---|---|---|---|
| **S1** | Harden contact validation: max lengths on all four fields + `readJsonBody(req, 8_000)` | none | none | Yellow (behaviour change) |
| **S2** | TD-06 — injectable limiter store + Upstash `redisStore` + apply per-IP limit to `POST /api/contact` | `@upstash/redis` | Upstash | Yellow |
| **S3** | TD-05 — Turnstile verification on contact form | none | Cloudflare Turnstile | Yellow |

S1 alone removes the A2 risk at near-zero cost and should be approved
independently and immediately.

**Contract decision for S2.** `check()` is currently synchronous and all four
call sites rely on that. Making it async is a 4-line change and is the honest
option — a store-backed limit *cannot* be synchronous. Recommended:

```js
// Same shape, now awaited.
export function createRateLimiter({ limit, windowMs, store = memoryStore })
export async function check(key)
```

with `createRateLimiter` still returning a `check` function so the module
surface barely changes. Call sites change from `const limit = xLimiter(k)` to
`const limit = await xLimiter(k)`.

> Alternative rejected: keeping `check()` synchronous by caching Redis results
> in memory. That reintroduces the exact per-instance staleness TD-06 exists to
> fix.

**Store interface** (small, testable, no Redis import in tests):

```js
// store.hit(key, windowMs, limit) -> { count, ttlMs }
// memoryStore  -> current Map semantics
// redisStore   -> INCR + PEXPIRE in a pipeline, returning count and ttl
```

**Fail-open vs fail-closed.** Recommendation: **fail-open for `contact`,
fail-closed is not appropriate; fail-open for all four limiters** but emit a
structured `console.error` and, ideally, a `RateLimiterUnavailable` counter so
an outage is visible. Rationale: a Redis outage taking down cadet check-in
during a parade is a worse outcome than a temporary absence of throttling.
This must be an explicit approved decision, not a default.

---

## 4. Is a shared external store required?

| Question | Answer |
|---|---|
| For **TD-06** to actually work on Vercel? | **Yes.** A process-local `Map` cannot be shared across serverless instances or survive cold starts. No amount of in-code cleverness changes this. |
| Does the store have to be Redis? | **No.** PostgreSQL (Option A) satisfies "shared" too. Redis is faster and adds no schema migration. |
| Is a store required for **S1** (validation hardening)? | **No.** |
| Is a store required for **S3** (Turnstile)? | **No.** Turnstile is an independent, stateless verification. |

**Therefore:** the minimum correct answer is *one* shared store. Upstash is
recommended over the database because it needs no migration (TD-01/02/03 keep
the migration chain blocked — adding a `RateLimitHit` model would deepen that
blocking) and because Redis `INCR`+`PEXPIRE` is a natural fit for a sliding
window. Note this explicitly: **Option A is disfavoured partly because the
migration chain is currently unsafe to extend (TD-01/02/03).**

---

## 5. Environment variables and configuration

### 5.1 New variables (names only — no values)

| Variable | Step | Scope | Purpose | Example *format* |
|---|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | S2 | server | Upstash REST endpoint | `https://<name>.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | S2 | server | Upstash auth token | opaque string |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | S3 | **client** (public) | Widget site key | `0x4AAA…` |
| `TURNSTILE_SECRET_KEY` | S3 | server | `siteverify` secret | `0x4AAA…` |

Guard pattern: if S2 vars are absent, fall back to `memoryStore` **and log a
warning once at startup** — so local development and tests need no account.
Same for S3: if `TURNSTILE_SECRET_KEY` is unset, skip verification but log
loudly. Both fallbacks must be **explicitly approved**, because silently
degrading security is exactly how TD-05/TD-06 would recur.

### 5.2 Configuration changes

| File | Change | Step |
|---|---|---|
| `.env.example` | add the 4 names above with empty values + comments | S2, S3 |
| `next.config.ts` | **CSP only**: add `https://challenges.cloudflare.com` to `script-src` and `frame-src`; add it to `connect-src` if needed | S3 |
| `package.json` | add `@upstash/redis` dependency | S2 |

**CSP is a security control.** Loosening it must be the *minimum* addition that
Turnstile requires — do not add `unsafe-eval`, do not widen `default-src`.

No change to `vercel.json` (none exists) and no cron required.

### 5.3 Existing variables — unaffected

`DATABASE_URL`, `AUTH_SECRET`, `ATTENDANCE_CODE_SECRET`, `NEXTAUTH_SECRET`,
Supabase/proxy vars: **no change**.

---

## 6. Test strategy

Follow the existing `fake-db.mjs` + `node --test` conventions. All new suites
must be **CI-safe** (no DB, no network) so they can join the C1 12-suite set.

### 6.1 New / extended suites

| Suite | Tests | Depends on |
|---|---|---|
| `scripts/rate-limit-store.test.mjs` (new) | injectable store contract; two independent store instances do **not** share budget; window expiry; `retryAfterSeconds` correctness; fail-open path when store throws | none |
| `scripts/contact-validation.test.mjs` (new) | max-length rejection per field; oversize body rejected; valid body accepted; Zod error → 400 | none |
| `scripts/contact-rate-limit.test.mjs` (new) | N+1 requests from one IP → **429** with `retryAfterSeconds`; distinct IPs independent; limiter runs **before** `prisma.create` (assert no insert on the 429 path) | fake store |
| `scripts/turnstile.test.mjs` (new) | missing token → 400; invalid token → 403; valid token → proceeds; **CF unreachable → defined behaviour** (fail-open or 503, per approval) | `fetch` stub, no network |
| `scripts/attendance-rules.test.mjs` (extend) | existing 5 assertions must still pass **unchanged** — this proves S2 did not regress the caller contract | none |

### 6.2 Regression requirement

The existing test at `attendance-rules.test.mjs:573` asserts the synchronous
contract (`limiter("cadet-1").allowed`). If S2 makes `check` async, **that test
must be updated to `await`** — and that update must be called out explicitly in
the change record, because editing a passing test is exactly the signal a
reviewer should look at. Recommendation: keep a `memoryStore`-backed
synchronous-compatible wrapper **only if** it does not reintroduce staleness;
otherwise accept the test edit and document it.

### 6.3 Manual / staging verification (cannot be automated locally)

- Two-process test against a real Upstash instance: exhaust from process A,
  confirm process B is blocked. **This is TD-06's actual acceptance criterion**
  and cannot be proven with `memoryStore`.
- Turnstile in a real browser.
- Confirm Vercel cold start does not reset the count (deploy preview + `curl` loop).

### 6.4 CI

Adding the new CI-safe suites to `.github/workflows/ci.yml` is a **separate
change** and is **out of scope for this plan** (C1 is already uncommitted and
unverified; see the C1 record). Listed here so it is not forgotten.

---

## 7. Files expected to change

| File | Step | Nature | Risk |
|---|---|---|---|
| `src/app/api/contact/route.ts` | S1, S2, S3 | add size cap, max lengths, limiter, Turnstile verify | Medium — public endpoint |
| `src/lib/rate-limit.mjs` | S2 | add injectable store, async `check`, keep 4 exported limiters | **High** — touches auth-adjacent throttling for check-in |
| `src/lib/rate-limit-store.mjs` *(new)* | S2 | `memoryStore`, `redisStore`, fail-open wrapper | Medium |
| `src/app/api/attendance/check-in/route.ts` | S2 | `await` the 3 limiter calls | **High** — security-critical path |
| `src/app/api/admin/attendance/sessions/[id]/records/route.ts` | S2 | `await` the 1 limiter call | Medium |
| `src/components/ContactClient.tsx` *(or equivalent)* | S3 | Turnstile widget + token field | Low–Medium |
| `src/lib/turnstile.mjs` *(new)* | S3 | `verifyTurnstile(token, ip)` | Low |
| `next.config.ts` | S3 | CSP additions only | **High** — security header |
| `.env.example` | S2, S3 | 4 new names | Low |
| `package.json`, `package-lock.json` | S2 | `@upstash/redis` | Low–Medium |
| `scripts/*.test.mjs` | all | new suites + 1 updated assertion | Low |

**Explicitly NOT changed:** `prisma/schema.prisma`, any migration,
`src/lib/guard.ts`, `src/lib/auth.ts`, `src/proxy.ts`, audit modules,
`.github/workflows/ci.yml`.

---

## 8. Risks, trade-offs, rollback

### 8.1 Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Async limiter change breaks check-in for cadets during a live session | **High** | `await` at all 4 sites; run `attendance-rules` + `attendance-service` suites; manual check-in rehearsal before deploy |
| R2 | Upstash outage blocks check-in if fail-closed | **High** | Explicit fail-open decision (§3.4) + error logging |
| R3 | Turnstile CSP addition breaks other pages | **Medium** | Minimal CSP delta; verify build + all public pages after change |
| R4 | Turnstile blocks legitimate cadets/visitors | **Medium** | Use managed (invisible) mode; keep server-side fallback if CF returns 5xx |
| R5 | `@upstash/redis` bundle inflation in serverless functions | Low | HTTP client is small; confirm build size delta |
| R6 | Contact spam protection gives false confidence while Redis is unset | **Medium** | Startup warning + documented requirement; never silently fall back in production |
| R7 | Editing a **passing** test (`attendance-rules:573`) looks like weakening it | **Medium** | Change is `await` only; call it out in the review record |
| R8 | Rotation/leak of Upstash token | Medium | Env-var only, never committed; separate token per environment |

### 8.2 Trade-offs

- **Redis vs DB:** lower latency, no migration — but a **new external dependency
  and a third-party outage surface**.
- **Fail-open vs fail-closed:** availability over strict enforcement. Chosen for
  check-in continuity; must be an approved, documented decision.
- **Turnstile vs rate-limit-only:** Turnstile stops automation far more
  effectively, but adds a client-side third party and a CSP relaxation.
- **Per-IP vs per-user on contact:** contact is unauthenticated, so IP is the
  only available key. IP is shared behind campus NAT — a modest but real
  false-positive risk at MIT WPU. Recommendation: **combine** a generous per-IP
  limit with Turnstile rather than a tight IP limit alone.

### 8.3 Rollback plan

All steps are independently revertible; **nothing touches the database schema**,
so no migration rollback is ever needed.

| Step | Rollback | Time |
|---|---|---|
| S1 | Revert `contact/route.ts` to current validation | <1 min |
| S2 | Unset `UPSTASH_*` → `memoryStore` fallback restores today's exact behaviour. Full revert: restore `rate-limit.mjs` + 2 route files from git | <5 min |
| S3 | Unset `TURNSTILE_SECRET_KEY` → verification skipped (with warning). Full revert: restore `ContactClient`, `turnstile.mjs`, `next.config.ts` | <5 min |
| Dependency | `npm uninstall @upstash/redis` | <1 min |

**Deployment-level rollback:** Vercel instant rollback to the previous
deployment covers every step at once.

**Data rollback:** none required — no schema change, no destructive write.
Pre-existing `ContactMessage` spam rows can be cleaned with a `DELETE` after
review (not part of this plan).

---

## 9. Deliverable summary and open decisions

### What is certain (verified)
- Contact route has zero abuse protection and unbounded field lengths.
- The limiter is process-local and says so in its own header.
- Deployment is Vercel serverless ⇒ **a shared store is required for TD-06**.
- The limiter's public contract is `check(key)`; all 4 call sites depend only on it.
- There is no contact test suite and no 429 assertion anywhere.

### Decisions required from the owner before implementation

1. **Store choice:** Upstash Redis (recommended) **or** database-backed limiter?
   (DB is free-of-new-service but extends the currently-blocked migration chain.)
2. **Approve `@upstash/redis`** as a new dependency.
3. **Fail-open or fail-closed** when the store is unavailable?
4. **Approve the CSP relaxation** required by Turnstile.
5. **Approve async `check()`**, including the one-line `await` edit to an
   existing passing test.
6. **Sequencing:** S1 first (no dependency, immediate benefit), then S2, then S3?
7. **Approval for an Upstash account** and Cloudflare Turnstile site — both free tiers.

### Recommendation

Approve and ship **S1 immediately** (validation hardening — zero dependency,
removes the easiest attack), then **S2** (Upstash + injectable store) as the
structural fix, then **S3** (Turnstile) as defence in depth.

Do **not** apply a limiter to `/api/contact` while the store remains
process-local — that would satisfy an acceptance test while proving little in
production.

---

**END OF PLAN — no files were modified in producing it.**
