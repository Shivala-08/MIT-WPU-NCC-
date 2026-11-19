# Technical Debt Register

**Repository:** `MIT-WPU-NCC-` · **Branch:** `fix/auth-identity` · **HEAD:** `96987cf`
**Rechecked:** 13 November 2026 · **Method:** read-only source inspection
**Baseline:** the 13 November 2026 audit (TD-01…TD-14)

Every row below was **re-verified against the current working tree** in this
session. The audit's findings were treated as claims to check, not as facts.

**Verified status legend:** `CONFIRMED` — still present, evidence re-read this
session. `CHANGED` — differs from the audit description. `RESOLVED` — no longer
present. `UNCERTAIN` — cannot be established without a decision or access.

**Global result:** all 14 findings are **CONFIRMED present**. None resolved.
Two nuances are recorded (TD-03, TD-11) where the audit's framing was slightly
stronger than the evidence supports.

---

## 1. Summary board

| ID | Issue | Sev | Blocks launch | Autonomy | Status |
|---|---|---|---|---|---|
| TD-01 | Phase 3 migration checksum mismatch | P0 | **YES** | Red | CONFIRMED |
| TD-02 | Deactivation migration, no history row | P0 | **YES** | Red | CONFIRMED |
| TD-03 | M1 migration not applied | P0* | Chain only | Red | CONFIRMED (nuanced) |
| TD-04 | Production identity unverified | P0 | **YES** | Red | CONFIRMED |
| TD-05 | Contact form unthrottled | P1 | No | Yellow | CONFIRMED |
| TD-06 | Rate limiter process-local | P1 | No | Yellow | CONFIRMED |
| TD-07 | Study-material downloads broken | P2 | No | Green→Yellow | CONFIRMED |
| TD-08 | Admin interfaces missing | P2 | No | Yellow | CONFIRMED |
| TD-09 | No consent records | P2 | Compliance | Yellow | CONFIRMED |
| TD-10 | Public placeholders / dead links | P2 | No | Green→Yellow | CONFIRMED |
| TD-11 | Sequential bulk marking | P2 | No | Yellow | CONFIRMED (nuanced) |
| TD-12 | 41 ESLint warnings | P3 | No | **Green** | CONFIRMED |
| TD-13 | Vestigial auth models | P3 | No | **Green** | CONFIRMED |
| TD-14 | README stale structure | P3 | No | **Green** | CONFIRMED |

\*TD-03 blocks the migration chain, not the running application.

---

## 2. Immediate execution windows

| Window | Issues | Why they can start now |
|---|---|---|
| **W1 — Zero-risk cleanup** | TD-12, TD-13 (analysis), TD-14 | Code-only, no DB, no policy |
| **W2 — Investigation** | TD-07, TD-10, TD-11 | Produce proposals + baselines |
| **W3 — Needs approval** | TD-05, TD-06, TD-08, TD-09 | New dep / infra / schema / policy |
| **W4 — Owner decision (blocked)** | TD-01, TD-02, TD-03, TD-04 | Database owner + administrator |

---

## 3. Issue detail

### TD-01 — Phase 3 migration checksum mismatch

| Field | Value |
|---|---|
| Severity | **P0** |
| Status | **CONFIRMED** |
| Evidence | `prisma/migrations/20261030080432_phase3_attendance_operations/migration.sql` hashes to `9b9c520d85b45ab1…`. `docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md:24` records the value stored in `_prisma_migrations` as `8031ecf36db28804…`. Verified this session with `shasum -a 256`. |
| Impact | `prisma migrate deploy` refuses the entire chain for any database that applied the older file. Fresh databases are unaffected. The application runs correctly because it reads the schema, not the history. |
| Root cause | The migration was edited after it was applied (phase 3.5.3 added an idempotence/`btrim` guard). Prisma has no command to refresh a checksum on an applied migration. |
| Dependencies | TD-02 must be resolved in the same operation, because an unresolved checksum makes any deploy attempt fail before the deactivation row can be reconciled. |
| Blocks | TD-03 (M1), every future migration, any production deploy. |
| Options | Five documented in `PHASE_3_8_MIGRATION_DECISION_MATRIX.md` Part A.1: leave unresolved / restore file / compare-and-swap / resolve-rolled-back / rebuild history. **Option 4 is documented as unsafe** (the SQL is not idempotent; a `btrim("AttendanceStatus")` call fails on second run). |
| Required decision | **Database owner**, in writing. Not delegable to the agent. |
| Acceptance criteria | `prisma migrate status` reports no pending migration, and `prisma migrate diff` returns an empty script against a disposable database. |
| Verification | Disposable-DB rehearsal (never `ncc_dev`, never production), then `migrate deploy` exit 0. |
| Autonomy | **Red.** |

---

### TD-02 — Account deactivation migration has no history row

| Field | Value |
|---|---|
| Severity | **P0** |
| Status | **CONFIRMED** |
| Evidence | `prisma/migrations/20261101090000_account_deactivation/migration.sql` exists, hashes to `4ef0c67312d5a1ca…`. `PHASE_3_8_MIGRATION_DECISION_MATRIX.md:118` and the README record that its **schema effects are present** locally (columns, index, both FKs) but `_prisma_migrations` has no row for it. |
| Impact | `migrate status` lists it as pending even though the objects exist. A rerun fails on the first statement (`ADD COLUMN "deactivatedAt"` has no `IF NOT EXISTS`). |
| Root cause | Applied by hand in a single transaction after a backup, with `_prisma_migrations` deliberately not edited. |
| Dependencies | Must follow or accompany TD-01. |
| Options | `migrate resolve --applied` after the 10 preconditions in `PHASE_3_8_MIGRATION_DECISION_MATRIX.md` §B.1 are all true for the target database. |
| Required decision | **Database owner**, per environment. |
| Acceptance criteria | The row appears in `_prisma_migrations` with checksum `4ef0c673…`; `migrate status` no longer lists it. |
| Verification | Read `_prisma_migrations` for the row; re-run `migrate status`. |
| Autonomy | **Red.** |

---

### TD-03 — M1 `approvalDecisionSource` not applied

| Field | Value |
|---|---|
| Severity | **P0 (chain), not independently breaking** |
| Status | **CONFIRMED — with a nuance** |
| Nuance | The audit called TD-03 "P0*". Evidence supports that qualifier: the application **deliberately works without the column**. `src/lib/approval-decision-source.mjs:9-19` documents the deployment window, and `decisionSourceColumnAvailable()` probes `information_schema` once per process, caching the result. So TD-03 breaks nothing at runtime; it only leaves schema drift. |
| Evidence | `prisma/migrations/20261105000000_approval_decision_source/migration.sql` hashes to `47c3e4b871117dde…`; not applied locally; `prisma/schema.prisma` already declares the column and enum. |
| Impact | Schema drift of exactly one enum + one column. `migrate diff` is non-empty. The column's absence is tolerated, but the audit trail's decision provenance relies on a fallback. |
| Dependencies | Blocked by TD-01 and TD-02. |
| Acceptance criteria | Enum `ApprovalDecisionSource` and `User.approvalDecisionSource` exist; `migrate diff` empty; backfill counts match the pre-migration report in the decision matrix §C.3. |
| Verification | `information_schema` assertions (§C.4) + `migrate diff`. |
| Autonomy | **Red.** |

---

### TD-04 — Production database identity unverified

| Field | Value |
|---|---|
| Severity | **P0** |
| Status | **CONFIRMED** |
| Evidence | `docs/PHASE_3_8_EXECUTION_RECORD.md` §3 and §8. Zero of 18 required handoff fields answered. No administrator response exists anywhere in the workspace. `~/.pgpass` absent; `PGPASSFILE` unset. The reference `qkmpowtxkpbxelbbqdij` remains unverified. |
| Impact | No production inspection is possible. Every production value (schema, migration history, the three discrepancies) is **UNKNOWN**, not "absent". |
| Dependencies | Blocks nothing in code; blocks **all** deployment decisions. |
| Required action | **Administrator** completes `docs/PHASE_3_8_ADMIN_ACCESS_REQUEST.md`. |
| Acceptance criteria | 18/18 fields answered; read-only role confirmed by capability, not by name. |
| Verification | Gate 2B intake checklist returns READY. |
| Autonomy | **Red.** |

---

### TD-05 — Contact form has no abuse protection

| Field | Value |
|---|---|
| Severity | **P1** |
| Status | **CONFIRMED** |
| Evidence | `src/app/api/contact/route.ts` — grep for `rateLimit\|limiter\|turnstile\|captcha` returns **0**. Validation is Zod only. No auth required (correctly public). |
| Impact | Unauthenticated attacker can insert unbounded rows into `ContactMessage`. Free-tier storage exhaustion, inbox flooding. |
| Root cause | Roadmap item A15 (Turnstile + rate limit) was never implemented; the form shipped with validation only. |
| Proposed solution | (a) apply the existing `createRateLimiter` to `POST /api/contact` by IP; (b) add Cloudflare Turnstile server-side verification. |
| Dependencies | (b) requires **new dependency + external service** → Yellow. (a) is achievable with existing code. |
| Acceptance criteria | More than N requests per window from one IP return 429; requests without a valid Turnstile token are rejected. |
| Verification | Repeat-request test; missing/invalid token test. |
| Autonomy | **Yellow** (prepare, approve before applying). |

---

### TD-06 — Rate limiter is process-local

| Field | Value |
|---|---|
| Severity | **P1** |
| Status | **CONFIRMED** |
| Evidence | `src/lib/rate-limit.mjs:1-10` — the file's own header states "The limits are per process. A deployment with more than one instance needs a shared store before the limits can be trusted across instances." Implementation is `new Map()` at line 8. |
| Impact | On Vercel serverless, each cold start gets a fresh `Map` and concurrent instances do not share state. Limits protecting the **6-digit manual code** (10⁶ space, `manualCodeLimiter` limit 10 / 10 min) are materially weaker than they appear. |
| Root cause | Deliberate simplification for local/single-instance use, documented honestly by the author. |
| Proposed solution | Redis/Upstash-backed limiter implementing the same `check(key)` contract, so call sites do not change. |
| Dependencies | New external service (Upstash) → Yellow; roadmap already names Upstash. |
| Acceptance criteria | Limits hold across two concurrent instances; existing limiter tests still pass via an injectable store. |
| Verification | Two-process test against a shared store. |
| Autonomy | **Yellow.** |

---

### TD-07 — Study-material downloads are broken

| Field | Value |
|---|---|
| Severity | **P2** |
| Status | **CONFIRMED** |
| Evidence | `src/app/api/study-materials/download/[id]/route.ts:6-16` defines 9 `defaultMaterials` entries resolving to `/study/*.pdf`. `ls public/study` → **directory does not exist**. `src/app/study-materials/page.tsx:22` ships a matching fictional catalog (titles, descriptions, invented file sizes). |
| Impact | Every default catalog entry 404s after a successful auth check. Visible, user-facing breakage. |
| Root cause | Demo/seed content written before any real documents were supplied; the storage move to a private bucket (roadmap A13) never happened. |
| Note | This is **not** a security hole: authorization is correctly checked *before* the redirect. It is a content-and-storage gap. |
| Proposed solution | Choose one: (a) supply real PDFs and serve them from a private bucket with short-lived signed URLs; (b) remove the 9 default entries so the catalog reflects only database rows. |
| Dependencies | (a) requires **real documents from the unit** → human input. (b) is code-only. |
| Acceptance criteria | Either every listed material downloads successfully, or no material is listed that cannot be downloaded. |
| Verification | Logged-in fetch of each listed id returns a file, not 404. |
| Autonomy | **Green** (investigate) → **Yellow** (decide storage direction). |

---

### TD-08 — Admin interfaces missing

| Field | Value |
|---|---|
| Severity | **P2** |
| Status | **CONFIRMED** |
| Evidence | `src/app/admin/` contains only `attendance, audit, cadets, leave, reports, roster` + `AdminClient.tsx`. **No** `officers`, `events`, `gallery`, `settings`, `messages` directories. `Officer`, `Event`, `EventImage`, `GalleryImage`, `SiteStats` all exist in `prisma/schema.prisma` with no admin route. |
| Impact | Officers cannot self-serve content. Roadmap milestone M4 ("officers run the site themselves") is unreachable. `api/admin/messages` and `api/admin/study-materials` exist as APIs but have no dedicated management page. |
| Root cause | Phase 4 (content management) was not implemented; Phase 3 (attendance/leave) was prioritised. |
| Proposed solution | Six specifications required (roles, permissions, API shape, DB deps, UI, validation, audit behaviour, tests) before any code. See `docs/MASTER_PROJECT_CONTEXT.md` backlog. |
| Dependencies | TD-01/02/03/04 for anything that must be deployed. |
| Acceptance criteria | An officer adds an event and a notice without developer help (M4). |
| Verification | End-to-end walkthrough by a non-developer. |
| Autonomy | **Yellow.** |

---

### TD-09 — No consent records

| Field | Value |
|---|---|
| Severity | **P2** |
| Status | **CONFIRMED** |
| Evidence | `grep -c "model Consent" prisma/schema.prisma` → **0**. Roadmap A7 (store policy version + acceptance time) and B7 (first-login consent gate) unimplemented. `/privacy` and `/terms` pages exist. |
| Impact | No auditable evidence that a cadet accepted a given policy version. A privacy compliance gap, and a data-retention gap the README itself flags as undecided. |
| Dependencies | **The institution must state its retention period and who approves photos** — the roadmap lists this as an open decision (section 15). The agent must not invent it. |
| Acceptance criteria | A consent row per user per policy version; a new user cannot reach `/dashboard` without accepting. |
| Verification | New-account journey is gated; version bump re-prompts. |
| Autonomy | **Yellow** (policy decision is human). |

---

### TD-10 — Public content placeholders and dead links

| Field | Value |
|---|---|
| Severity | **P2** |
| Status | **CONFIRMED** |
| Evidence | `src/app/(public)/about/AboutClient.tsx:239-242` — four officers literally named `Lt. Col. [Name]`, `Capt. [Name]`, `SUO [Name]`, `JUO [Name]` (4 occurrences). `src/components/Footer.tsx:45,52,59,66` — four `href="#"`. Fictional study-material catalog (see TD-07). |
| Impact | Visible unprofessional content on the public site; roadmap B4's "no `[Name]` or `#` links remain" is not met. |
| Root cause | Real unit content (officer names, ranks, photos, social URLs, contact details) was never supplied. |
| Proposed solution | A content checklist for the unit. Technical dead links may be fixed once the correct destination is known. **Real names, ranks and contact details must come from the unit** — the agent must not fabricate them. |
| Dependencies | Human content input. |
| Acceptance criteria | Zero `[Name]` occurrences; zero `href="#"`; every officer row comes from the database. |
| Verification | `grep -rn "\[Name\]\|href=\"#\"" src/` returns nothing. |
| Autonomy | **Green** (detect) → **Yellow** (content). |

---

### TD-11 — Sequential bulk attendance marking

| Field | Value |
|---|---|
| Severity | **P2** |
| Status | **CONFIRMED — with a nuance** |
| Nuance | The audit reported "sequential query loop". Evidence confirms it precisely: `src/lib/attendance-service.mjs:469` opens `for (const mark of validation.marks)` and the loop body contains **2 awaited writes** (`tx.attendance.update` / `create`) per mark. One `findMany` is correctly hoisted out of the loop into a `Map`, so this is *not* an N+1 read problem — it is an N-write problem. |
| Impact | A 150-cadet parade issues ~150 sequential round trips inside one open transaction. Correct but slow, and the long transaction increases lock contention. |
| Constraints | Writes must remain inside the transaction for atomicity; a naive `createMany` would break the update path and the audit trail. Any fix must preserve per-mark semantics. |
| Proposed solution | Batch: partition into creates and updates, then `createMany` + `UPDATE … FROM (VALUES …)` per status class, still inside `runInTransaction`. |
| Dependencies | None technically; **must be preceded by a measured baseline** (the manual requires establishing a baseline before optimising). |
| Acceptance criteria | Identical resulting rows and audit entries; measurable round-trip reduction with representative data (~150 marks). |
| Verification | Behavioural equivalence test + measured timing comparison. |
| Autonomy | **Yellow** (scope approval; baseline first). |

---

### TD-12 — 41 ESLint warnings

| Field | Value |
|---|---|
| Severity | **P3** |
| Status | **CONFIRMED** |
| Evidence | `npm run lint` → `✖ 41 problems (0 errors, 41 warnings)`. All `@typescript-eslint/no-unused-vars`. Examples: `AboutClient.tsx:3` (8 unused icons), `OfficerDashboardClient.tsx:11-18,94`, `CadetDashboardClient.tsx:3,12`, `dashboard/status/page.tsx:65,67`, `LightboxGallery.tsx:3`, `register/RegisterClient.tsx:11,12`, `attendance/route.ts:14` (`_req`). |
| Impact | Noise that hides a real warning appearing later. Zero runtime impact. |
| Proposed solution | Remove unused imports/variables; keep `_`-prefixed intentionally-unused parameters (may need an ESLint `argsIgnorePattern`). |
| Dependencies | None. |
| Acceptance criteria | `npm run lint` reports 0 problems; `tsc` and build still pass. |
| Verification | Re-run lint/tsc/build. |
| Autonomy | **Green** — the safest concrete task in the register. |

---

### TD-13 — Vestigial authentication models

| Field | Value |
|---|---|
| Severity | **P3** |
| Status | **CONFIRMED** |
| Evidence | `PasswordResetToken` and `EmailVerificationToken` are declared in `prisma/schema.prisma`. Grep across `src/` and `scripts/` for either name returns **0 references** outside the schema. |
| Impact | Dead schema; confusion about whether password login or email verification exists. Google-only sign-in makes both obsolete. |
| Caution | The manual requires checking historical and runtime references before removal. Both have **no runtime reference**, but removal requires a **migration** (Dropping a table) → Yellow, not Green. |
| Proposed solution | Either document them as intentionally reserved, or drop them in a future migration bundled with TD-01/02/03 reconciliation. |
| Acceptance criteria | Schema has no unused auth token models, or they are explicitly documented as reserved. |
| Verification | Grep + `migrate diff` after the drop. |
| Autonomy | **Green** (document) / **Yellow** (drop). |

---

### TD-14 — README describes an outdated project structure

| Field | Value |
|---|---|
| Severity | **P3** |
| Status | **CONFIRMED** |
| Evidence | `README.md:459` lists `│   └── middleware.ts        # Role-based route guard`. The actual file is `src/proxy.ts` (Next 16 renamed `middleware` to `proxy`; the build output confirms `ƒ Proxy (Middleware)`). The structure block also omits `src/lib/*.mjs` (the bulk of the logic) and the `docs/` directory. |
| Impact | Misleads every new developer about where authorization lives. |
| Proposed solution | Correct the structure block and rename the comment to describe the proxy's true role ("checks only that a caller is signed in"). |
| Dependencies | None. |
| Acceptance criteria | The documented tree matches `find src -maxdepth 2`. |
| Verification | Manual diff of doc tree vs actual. |
| Autonomy | **Green.** |

---

## 4. Dependency graph

```
TD-04 (production identity)
   └─► unlocks Gate 2 inspection
          └─► informs TD-01 / TD-02 / TD-03 decisions
                 └─► TD-01 + TD-02 must be resolved together
                        └─► TD-03 (M1)
                               └─► any deploy
                                      └─► TD-07, TD-08, TD-09 become deployable

Independent tracks (no dependency on the above):
   TD-12  (Green, now)
   TD-14  (Green, now)
   TD-13  (document now, drop later with a migration)
   TD-05a (in-process limiter, no new dep)
   TD-11  (baseline first, then batch)
   TD-10  (detect now, content needs the unit)
```

---

## 5. What the agent must NOT do

- Choose a TD-01 option. That is the database owner's written decision.
- Run `migrate resolve`, `migrate deploy`, `db push` or `reset` anywhere.
- Invent officer names, ranks, phone numbers, statistics or study documents.
- Decide the retention period or the consent policy.
- Weaken an authorization check to make a test pass.
- Remove TD-13 models without a migration and approval.

---

**End of register.** Re-verify against the working tree before acting; this
document describes `96987cf` as inspected on 13 November 2026.
