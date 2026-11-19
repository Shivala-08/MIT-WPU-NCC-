# C1 — CI Test Coverage: Implementation Record

**Task:** Assignment C1 — expand CI test coverage
**Date:** 13 November 2026 · **Branch:** `fix/auth-identity` · **HEAD:** `96987cf`
**Decision taken:** **B‴ — implemented and locally verified, but deliberately left
uncommitted.** Nothing was committed, pushed, merged or deployed.

---

## 1. What C1 does

Adds one step, `Logic tests`, to the existing `.github/workflows/ci.yml`. The
step runs every test suite that needs **no database and no development server**.

### File changed

| File | Change | Status |
|---|---|---|
| `.github/workflows/ci.yml` | +25 lines, −0 lines, one hunk | **uncommitted** (working tree) |

No other file was touched by C1.

### Placement

The step sits between `TypeScript check` and `Build`, so a test failure stops
the job before a costly build.

---

## 2. Coverage — what is included and what is not

### Included: 12 suites / 167 tests

| # | Suite | Tests |
|---|---|---|
| 1 | `prisma-guard` | 12 |
| 2 | `prisma-target` | 12 |
| 3 | `eligibility` | 18 |
| 4 | `module-syntax` | 2 |
| 5 | `attendance-rules` | 35 |
| 6 | `profile-fields` | 9 |
| 7 | `attendance-service` | 25 |
| 8 | `account-service` | 15 |
| 9 | `account-deactivation` | 12 |
| 10 | `audit-hash-key` | 8 |
| 11 | `profile-photo` | 10 |
| 12 | `profile-service` | 9 |
| | **Total** | **167** |

These twelve pass **167 / 0 failed / 0 skipped** with:
- no PostgreSQL running,
- no `.env` file present,
- the CI placeholder `DATABASE_URL`.

That was verified by temporarily moving `.env` and `.env.local` aside and
restoring them afterwards. The suites do not import `helpers/db-suite.mjs`,
`helpers/integration.mjs`, `createPrismaClient`, `requireDatabase` or
`requireServer`.

### Excluded: 6 suites / 42 tests — database-dependent

| # | Suite | Tests | Why excluded |
|---|---|---|---|
| 1 | `approval-integration` | 7 | `openIntegrationDatabase()`; writes fixtures |
| 2 | `roster-integration` | 6 | same |
| 3 | `audit-integration` | 6 | same |
| 4 | `audit-rollback-integration` | 3 | same |
| 5 | `photo-integration` | 10 | same |
| 6 | `migration-attendance-status` | 10 | needs a real PostgreSQL; **does not skip** on the CI placeholder URL |
| | **Total** | **42** | |

**Arithmetic reconciles exactly:** 167 + 42 = **209**, the measured total across
all 18 suites.

Three of these are worth understanding, because they would have produced a
false-green:

- Without a `.env`, `approval-integration`, `roster-integration`,
  `audit-integration`, `audit-rollback-integration` and `photo-integration`
  report `pass 0, skipped N`. A CI job that accepts that is proving nothing.
- `migration-attendance-status` is subtler: the CI placeholder host
  (`localhost`) is classified **local** by `src/lib/prisma-target.mjs`, so the
  suite does **not** skip — it tries to connect and fails.

Both outcomes are unacceptable in CI, so all six are excluded. **They are not
covered by CI and this document does not claim they are.**

---

## 3. Local verification — passed

| Check | Command | Result |
|---|---|---|
| The 12-suite command, no `.env`, no DB | `node --test --test-concurrency=1 <12 suites>` | **167 pass / 0 fail / 0 skipped**, exit 0 |
| Same, with `.env` present (dev parity) | same | 167 / 0 / 0 — identical |
| YAML parses | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` | valid; 8 steps; `Logic tests` present |
| Suites present in workflow | `grep -c "test.mjs" ci.yml` | **12** |
| Failure fails the job | injected a deliberately failing test | exit **1** — correct |
| TypeScript | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors, 41 warnings (unchanged) |
| Build | `npm run build` | exit 0 |
| Dependency audit | `npm audit --audit-level=high` | exit 0 (7 moderate, dev-only, below the `high` gate) |
| Secrets in workflow | `grep "secrets." ci.yml` | **0** — no secret referenced |

The workflow needs no production credentials. It never connects to a database.

---

## 4. GitHub Actions verification — PENDING, and why

**No GitHub Actions run has occurred. None can succeed yet.**

### The blocker

`origin/main` (`ead930e`) **does not contain the code these tests test**:

| Check on `origin/main` | Result |
|---|---|
| `scripts/` directory | **absent** (0 entries) |
| `scripts/*.test.mjs` | **0 files** |
| `package.json` test scripts | **none** |
| `DATABASE_URL` env block in `main`'s `ci.yml` | **absent** (older workflow) |
| Phase 3 services (`src/lib/*.mjs`) | **absent** |

`main` is still at *"Phase 0: Setup and Google sign-in implementation"*. Phase 3
has never been merged into it.

Pushing a `main`-based C1 branch would therefore fail immediately with
`Cannot find module 'scripts/<suite>.test.mjs'` for all twelve suites — a red
job, by construction, not by any defect in the workflow.

Publishing a `fix/auth-identity`-based branch instead would publish the entire
Phase 3 body of work (46 modified + 82 untracked files), which is outside the
scope the owner approved.

### Consequence

C1 is **implemented and locally verified, but not CI-verified**. It stays
uncommitted in the working tree under decision **B‴**.

**C1 must not be described as "merged", "live" or "passing in CI".** It is
neither.

---

## 5. What happens when Phase 3 lands on `main`

Once `fix/auth-identity` is merged into `main` by the owner:

1. `scripts/` exists on `main`, and the twelve suites exist.
2. Commit the existing `ci.yml` change (25 lines) on a branch from `main`.
3. Open a pull request. The `Logic tests` step runs for real.
4. Expected result: **167 passed, 0 failed**.
5. Merge only after the run is green.

No change to the C1 workflow is needed — only the code it tests must arrive
first.

---

## 6. Deliberately not done

- Not committed, pushed, merged or deployed.
- No branch created on the remote.
- No new dependency added.
- No application source, Prisma schema or migration modified.
- No CI backend job for the 6 database-dependent suites (a separate task).
- TD-12 not started.
- The temporary `/tmp/ncc-c1-worktree` used to inspect `origin/main` was
  removed; it held no changes.

---

## 7. Status summary

| Criterion | Verdict |
|---|---|
| 12 CI-safe suites added | **DONE** |
| 6 DB-dependent suites excluded, with reasons | **DONE** |
| Local verification (167/167, tsc, lint, build, audit) | **PASS** |
| No secrets, no DB connection, no production credentials | **CONFIRMED** |
| Committed | **NO — intentional (B‴)** |
| GitHub Actions run green | **PENDING — blocked by Phase 3 not on `main`** |
| Mergeable | **NO** |
