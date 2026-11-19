# CI Improvement Plan

**Date:** 13 November 2026 · **HEAD:** `96987cf`
**Existing workflow:** `.github/workflows/ci.yml` (single job, `check`)
**Autonomy:** proposals only — no workflow was created or modified.

---

## 1. What exists today

`.github/workflows/ci.yml` runs one job on `ubuntu-latest`, Node 20, triggered on
push and pull request to `main`/`master`:

| Step | Command | Status |
|---|---|---|
| Install | `npm ci` | present |
| Lint | `npm run lint` | present |
| TypeScript | `npx tsc --noEmit` | present |
| Build | `npm run build` | present |
| Security audit | `npm audit --audit-level=high` | present |

The workflow sets `DATABASE_URL: postgresql://ci:ci@localhost:5432/ci?sslmode=disable`
with a comment explaining it is a placeholder so Prisma Client can be
constructed. **CI never connects to a database.** That is correct and deliberate.

### Assessment

The existing workflow is better than most. It is honest about its limits, it
does not pretend to run tests it cannot run, and it contains no secrets. It
already covers four of the six checks the manual asks for.

---

## 2. Gaps against the required checks

| Required check | Present? | Gap |
|---|---|---|
| 1. TypeScript compilation | **YES** | — |
| 2. ESLint | **YES** | — (but 41 warnings do not fail the build) |
| 3. Unit tests | **NO** | **Largest gap.** 209 server-free tests exist and pass, and none run in CI. |
| 4. Production build | **YES** | — |
| 5. Dependency vulnerability checks | **PARTIAL** | Runs on push/PR only; no schedule |
| 6. Migration-file consistency (no production) | **NO** | A local-only integrity check is feasible |

---

## 3. Proposed changes

Ordered by value-to-risk. Each is independently approvable.

### C1 — Add the server-free test suites (highest value, zero risk)

```yaml
      - name: Unit and logic tests
        run: |
          node --test \
            scripts/prisma-guard.test.mjs scripts/prisma-target.test.mjs \
            scripts/eligibility.test.mjs scripts/module-syntax.test.mjs \
            scripts/attendance-rules.test.mjs scripts/profile-fields.test.mjs \
            scripts/attendance-service.test.mjs scripts/account-service.test.mjs \
            scripts/account-deactivation.test.mjs scripts/approval-integration.test.mjs \
            scripts/roster-integration.test.mjs scripts/audit-hash-key.test.mjs \
            scripts/audit-integration.test.mjs scripts/audit-rollback-integration.test.mjs \
            scripts/photo-integration.test.mjs scripts/profile-photo.test.mjs \
            scripts/profile-service.test.mjs scripts/migration-attendance-status.test.mjs
```

- **Verified this session:** these 18 suites run without a database or a dev
  server and pass **209 tests, 0 failures**.
- They must be listed explicitly. `npm test` also pulls in 8 suites that require
  a live server on `localhost:3001` and a writable database — those would fail
  in CI.
- Risk: none. No network, no DB, no secrets.

### C2 — Fail on ESLint errors but not warnings

```yaml
      - name: Lint
        run: npm run lint -- --max-warnings=41
```

Then lower the number to 0 after TD-12 is fixed. This makes new warnings
visible without breaking CI on the 41 pre-existing ones.

Alternatively, once TD-12 is done: `--max-warnings=0`.

### C3 — Scheduled dependency check

```yaml
on:
  schedule:
    - cron: "0 3 * * 1"   # Mondays 03:00 UTC
```

Reuses the existing audit step. Catches advisories published after the last
commit.

### C4 — Migration-file integrity check (local only, never connects)

A script that verifies, without a database:

1. Every directory in `prisma/migrations/` contains a non-empty `migration.sql`.
2. `migration_lock.toml` declares `postgresql`.
3. Reported checksums are printed, so a checksum change is visible in the CI log.

It must **not** compare against `_prisma_migrations` — that requires a database.
It is a tripwire for accidentally edited migration files, which is exactly how
TD-01 arose.

### C5 — Test the pure-logic helper modules through `npm test` parity

Optional. Keep `npm run test:unit` as an npm script so developers and CI run the
same command:

```json
"test:unit": "node --test --test-concurrency=1 scripts/prisma-guard.test.mjs ..."
```

Then CI calls `npm run test:unit`. Single source of truth.

---

## 4. What CI must never do

- Connect to a real database (production or development).
- Run `prisma migrate deploy`, `migrate resolve`, `db push` or `reset`.
- Run the 8 integration suites (they need a server and write fixtures).
- Print an environment variable or a secret.
- Deploy.

---

## 5. Proposed workflow shape (not applied)

Two jobs in one workflow, so a failure names the area:

```
jobs:
  static:    npm ci → lint → tsc → build → audit          (exists today)
  logic:     npm ci → npm run test:unit                   (proposed C1)
```

No job needs `DATABASE_URL` except as the existing construction placeholder for
`static`.

---

## 6. Approval required

This plan changes `.github/workflows/` and `package.json`. Both are **Yellow**
under the autonomy policy. The file has not been modified.

Recommended path: approve **C1 alone** first. It is the only change that adds
real verification, it needs no new dependency, and it cannot break the build.

---

## 7. Outcome — C1 implemented (13 November 2026)

**C1 status: implemented and locally verified, deliberately uncommitted.**

Full record: `docs/CI_C1_IMPLEMENTATION_RECORD.md`. Decision **B‴**.

| Item | Result |
|---|---|
| `.github/workflows/ci.yml` | **modified in the working tree**, uncommitted (+25 / −0) |
| Suites included | **12** |
| Tests included | **167** |
| Suites excluded (database-dependent) | **6** |
| Tests excluded | **42** |
| 167 + 42 | **= 209** total |
| Local verification | **PASS** — 167/167, 0 failed, 0 skipped |
| TypeScript / lint / build / audit | PASS / 0 errors / PASS / PASS |
| GitHub Actions run | **NONE — cannot succeed yet** |

### Correction to section 3 of this plan

C1 as originally drafted listed **18 suites**. That was wrong. Verification
showed only **12** are environment-independent:

- `migration-attendance-status` needs a real PostgreSQL and does **not** skip on
the CI placeholder URL (`localhost` is classified *local*), so it would fail.
- `approval-integration`, `roster-integration`, `audit-integration`,
  `audit-rollback-integration` and `photo-integration` call
  `openIntegrationDatabase()` and, with no `.env`, report `pass 0, skipped N` —
  a false green.

The workflow contains the corrected 12-suite list.

### Why no GitHub Actions run exists

`origin/main` (`ead930e`) does not contain `scripts/` at all — Phase 3 has never
been merged. A `main`-based C1 branch would fail with `Cannot find module` for
every suite. C1 becomes CI-verifiable only after Phase 3 lands on `main`.

**C1 is therefore not mergeable and must not be described as passing in CI.**

Sections C2–C5 remain unimplemented and unapproved.
