# Master Project Context

**Prepared:** 13 November 2026 · **HEAD:** `96987cf` · **Branch:** `fix/auth-identity`
**Purpose:** the single entry point for a new senior engineer taking over this
repository. Read this first, then the documents it links to.

This document separates four kinds of statement, and labels each:

| Label | Meaning |
|---|---|
| **[REQ]** | What the original plan asked for |
| **[HIST]** | What a past session claimed it did |
| **[VERIFIED]** | What was read from the current source / filesystem this session |
| **[UNKNOWN]** | Cannot be established without access or a human decision |

---

## 1. What this project is

A cadet administration platform for the MIT-WPU NCC unit: a public information
site plus a three-role operational system (CADET / OFFICER / ADMIN). **[REQ]**

**Users and workflows**

| Role | Core workflows |
|---|---|
| Anonymous | Public pages, contact form, pre-registration |
| CADET | Own profile + private photo; own attendance %; QR/code check-in; leave requests |
| OFFICER | Cadet workflows + run sessions, mark attendance, decide leave, view reports |
| ADMIN | Officer workflows + approve/reject/deactivate accounts, roster import, study materials, announcements, audit log, session cancellation |

**Governing principle** (from `PROJECT_RULES.md`): never trust a client-supplied
user id; never expose the service key; every staff route checked server side.

---

## 2. Technology actually in use

**[VERIFIED]** from `package.json` and `prisma/schema.prisma`:

| Layer | Reality |
|---|---|
| Framework | Next.js **16.4.2** (App Router), React 19.3 |
| Language | TypeScript 5, plus plain `.mjs` service modules with `.d.mts` types |
| Auth | **NextAuth v5 / Auth.js beta**, Google OAuth only, JWT session (1 h) |
| ORM | Prisma 6, provider `postgresql` |
| Database | PostgreSQL 18.6 locally |
| UI | Tailwind 4, Framer Motion, lucide-react |
| Files | `sharp` (photos), `exceljs` (exports), `qrcode` |
| Validation | `zod`, `react-hook-form` |
| Auth storage | Private bucket or `.local-storage/` (dev) |

### The stack divergence — the most important thing to know

**[REQ]** The roadmap specified **Supabase Auth + Postgres RLS**, with
`supabase.auth.getUser()` and row-level security on every table.

**[VERIFIED]** The implementation uses **NextAuth + Prisma + application-layer
authorization**. There is no RLS. Authorization is enforced by
`src/lib/guard.ts::authorize()` on every protected route.

**This substitution is deliberate and sound.** Do not migrate back. The
consequence to internalise: *the database itself does not enforce access
control* — every route must call `authorize()`. The audit verified that 34 of
38 API routes call it directly and the remaining 4 are intentionally public or
delegate to a guarded handler.

---

## 3. How authorization actually works

**[VERIFIED]** — `src/lib/guard.ts` and `src/proxy.ts`

```
Request
  │
  ├─ src/proxy.ts  ──► "is a session cookie present?" ONLY
  │                    (Next 16 renamed middleware → proxy; build confirms)
  │
  └─ route/page
        └─ getSessionUser()  ──► DB read on EVERY request:
        │                        role, approvalStatus, deactivatedAt, roster.active
        └─ authorize(["ROLE"]) ──► 401 anonymous
                                   403 DEACTIVATED
                                   403 PENDING | REJECTED
                                   403 wrong role
```

Three properties worth preserving in any future change:

1. **The JWT carries identity only.** Role and approval state are re-read from
   the database per request, so revoking access takes effect immediately.
2. **`isApprovedAccount()`** = approved **and** not deactivated. One definition,
   used by pages and APIs, so they cannot disagree.
3. **`isAttendanceEligibleAccount()`** additionally requires an active roster row.

---

## 4. Data model — the non-obvious parts

**[VERIFIED]** `prisma/schema.prisma`

- **`User.approvalStatus` is the single source of truth.** `CadetProfile.status`
  is a *mirror* maintained by a database trigger and is never used for authz.
- **`ApprovalDecisionSource`** (NONE / AUTOMATIC / ADMINISTRATOR) records *who*
  decided, so an administrator's decision can never be overwritten by the
  automatic roster approval at sign-in.
- **Deactivation replaces deletion.** `deactivatedAt` is authoritative; the row
  and all history (attendance, leave, profile, audit) remain.
- **`CadetProfile.userId` is `onDelete: Restrict`** (was CASCADE) so a profile
  cannot be orphaned.
- **`Attendance`** has `@@unique([userId, sessionId])` — one authoritative mark.
- **QR tokens and manual codes store hashes only**, never the raw value.
- **`AttendancePolicy.thresholdConfirmed` defaults `false`** — the code refuses
  to present the 75% figure as an official NCC rule until someone confirms it.

---

## 5. Field ownership (profiles)

**[VERIFIED]** `src/lib/profile-fields.mjs`, used by routes, roster sync and tests.

| Owner | Fields |
|---|---|
| Roster | fullName, prn, regiNumber, wing, division, year, branch |
| Cadet | phone, address, parentContact, emergencyContact, bloodGroup, gender, height, weight |
| Administrator | dob |
| System | photoUrl, photoThumbnailUrl, status, userId, id, timestamps |

A request touching a field someone else owns is **rejected**, never silently
ignored.

---

## 6. Migration history — the current blocker

**[VERIFIED]** eight migration directories; checksums recomputed this session.

| # | Migration | On disk | In `_prisma_migrations` (local) | State |
|---|---|---|---|---|
| 1 | `20261026000000_core_tables` | `fe3db57a…` | same | applied |
| 2 | `20261027000000_init_baseline` | `64797f0c…` | same | applied |
| 3 | `20261029000000_account_approval_and_roster` | `29112131…` | same | applied |
| 4 | `20261030000000_cadet_profile_completion` | `7453b4c5…` | same | applied |
| 5 | `20261030080432_phase3_attendance_operations` | `9b9c520d…` | `8031ecf3…` | **MISMATCH (TD-01)** |
| 6 | `20261030210643_phase3_manual_fallback_code` | `98ded183…` | same | applied |
| 7 | `20261101090000_account_deactivation` | `4ef0c673…` | **no row** | **schema present (TD-02)** |
| 8 | `20261105000000_approval_decision_source` | `47c3e4b8…` | **no row** | **not applied (TD-03)** |

**Consequence:** `migrate deploy` cannot advance the chain. The application runs
fine because it reads the schema, not the history.

**Do not** use `migrate resolve --rolled-back` (option 4) — migration 5 calls
`btrim()` on an enum column and fails on replay, which would strand a *failed*
row blocking every later migration.

Full analysis: `docs/MIGRATION_RECONCILIATION_REPORT.md`,
`docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md`, `docs/MIGRATION_SAFETY.md`.

---

## 7. Deployment and production state

**[VERIFIED]**

- Target: Vercel. `npm run build` → exit 0, 34 routes + proxy.
- Build **does not** apply migrations; that is a separate protected step.
- `src/instrumentation.ts` asserts the DB target once per process at startup.
- **`AUDIT_HASH_KEY` is mandatory in production.** Without it every audit write
  fails *and rolls back the business transaction with it* — so admin actions
  would silently stop working. It must differ from the other secrets.
- CI (`.github/workflows/ci.yml`): lint, tsc, build, `npm audit`. **No tests.**
  Uses a placeholder `DATABASE_URL` and never connects.

**[UNKNOWN]** — production is entirely unverified (TD-04):

- Project identity, region, PostgreSQL version
- Whether production has **any** of TD-01/02/03
- Whether the Supabase Storage bucket exists
- Whether required env vars are set

**Do not record unknown production values as "absent" or "same as local".**

---

## 8. Contradictions and obsolete claims (documented, not concealed)

| Source | Claim | Reality |
|---|---|---|
| `README.md:459` | `middleware.ts` is the role-based route guard | File is `src/proxy.ts`; it checks **only** "signed in", never a role (TD-14) |
| README structure | Omits `src/lib/*.mjs` | ~8,300 lines of the actual business logic live there |
| README "backup that exists today" | Describes `ncc-dev-pre-deactivation-20261102-024155.dump` | **That file does not exist.** The real verified dump is `ncc_dev-20261107T070354Z.dump` |
| Docs | "281 tests pass" | Verified reproducible count is **209** (see `TEST_VERIFICATION_REPORT.md`) |
| `audit.md` (21 Oct) | "Current DB: SQLite" | Superseded — Postgres since Oct 27 |
| `audit.md` | Scores against PRD v2 R-01…R-49 | The two-builder roadmap states it *replaces* PRD v2 |
| Roadmap | Supabase Auth + RLS | NextAuth + app-layer authz |
| `docs/PHASE_3_8_BACKUP_INVENTORY.md` §8.3 | Restore rehearsal "PASS" | Reported, **no on-disk evidence** |

Kept deliberately: these records preserve the reasoning trail. Correcting them
is a documentation task, not a deletion task.

---

## 9. Document map

| Document | Role |
|---|---|
| `docs/MASTER_PROJECT_CONTEXT.md` | **this file** — start here |
| `docs/TECHNICAL_DEBT_REGISTER.md` | TD-01…TD-14, evidence-backed, prioritised |
| `docs/MIGRATION_RECONCILIATION_REPORT.md` | the one-page decision brief for the owner |
| `docs/TEST_VERIFICATION_REPORT.md` | exactly what was run; what was not |
| `docs/CI_IMPROVEMENT_PLAN.md` | proposed CI changes (not applied) |
| `docs/PHASE_3_8_EXECUTION_RECORD.md` | gate status and closure sequence |
| `docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md` | the five reconciliation options |
| `docs/PHASE_3_8_ADMIN_ACCESS_REQUEST.md` | the handoff awaiting an administrator |
| `docs/PHASE_3_8_BACKUP_INVENTORY.md` | backup states: created / archive-verified / restore-tested |
| `docs/MIGRATION_SAFETY.md` | legacy data rules and replay hazards |
| `docs/MIGRATION_EQUIVALENCE_ANALYSIS.md` | applied-file vs on-disk-file effects |
| `README.md` | operator-facing; **partly stale (TD-14)** |
| `PROJECT_RULES.md` | the unit's coding contract |
| `NCC MIT WPU ... Roadmap.md` | original plan; stack superseded |
| `audit.md` | first audit (21 Oct); partly superseded |

---

## 10. Outstanding human decisions

Nothing below can be decided by an engineer or an agent.

1. **TD-01/02/03** — which reconciliation option; requires written owner sign-off.
2. **TD-04** — administrator must supply the 18 handoff fields.
3. **Study materials** — supply real documents, or authorise removing the catalog.
4. **Public content** — officer names, ranks, photos, phone, social URLs.
5. **Consent** — the university's retention period and policy version.
6. **The 75% threshold** — confirm the real NCC rule (`thresholdConfirmed` stays false until then).
7. **Rate limiting** — whether to adopt Upstash (free tier) for TD-06.

---

## 11. Onboarding checklist for a new senior engineer

1. Read this file, then `TECHNICAL_DEBT_REGISTER.md`.
2. Run `npx tsc --noEmit && npm run lint && npm run build`.
3. Read `src/lib/guard.ts` — understand the authorization model before touching a route.
4. Read `src/lib/profile-fields.mjs` — understand field ownership before touching a form.
5. **Do not** run `migrate deploy`, `migrate resolve`, `db push` or `reset`.
6. **Do not** trust `README.md` for structure; trust `find src -type f`.
