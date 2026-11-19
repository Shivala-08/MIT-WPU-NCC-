# Test Verification Report

**Date:** 13 November 2026 · **HEAD:** `96987cf` · **Method:** suites executed locally

The purpose of this report is to state **exactly** what was run and what was not.
It does not repeat the audit's unverified "281 tests pass" claim. It replaces it
with a reproducible result.

---

## 1. Result summary

| Category | Suites | Tests | Pass | Fail |
|---|---|---|---|---|
| Logic suites (no server, no DB) | 18 | **209** | **209** | **0** |
| Integration suites (need live server) | 8 | — | — | **NOT RUN** |
| **Total verified** | **18** | **209** | **209** | **0** |

**The "281 tests pass" figure in the documentation was NOT reproduced.** The
verified number is 209. The difference is plausibly the 8 unrun integration
suites, but this report does not claim that — it simply records what was proven.

---

## 2. Executed — all passing

Each suite was run individually with `node --test scripts/<name>.test.mjs`.

| Suite | Tests | Pass | Fail | Needs |
|---|---|---|---|---|
| `prisma-guard` | 12 | 12 | 0 | — |
| `prisma-target` | 12 | 12 | 0 | — |
| `eligibility` | 18 | 18 | 0 | — |
| `module-syntax` | 2 | 2 | 0 | — |
| `attendance-rules` | 35 | 35 | 0 | — |
| `profile-fields` | 9 | 9 | 0 | — |
| `attendance-service` | 25 | 25 | 0 | — |
| `account-service` | 15 | 15 | 0 | — |
| `account-deactivation` | 12 | 12 | 0 | — |
| `approval-integration` | 7 | 7 | 0 | — |
| `roster-integration` | 6 | 6 | 0 | — |
| `audit-hash-key` | 8 | 8 | 0 | — |
| `audit-integration` | 6 | 6 | 0 | — |
| `audit-rollback-integration` | 3 | 3 | 0 | — |
| `photo-integration` | 10 | 10 | 0 | — |
| `profile-photo` | 10 | 10 | 0 | — |
| `profile-service` | 9 | 9 | 0 | — |
| `migration-attendance-status` | 10 | 10 | 0 | — |
| **Total** | **209** | **209** | **0** | |

Note on `migration-attendance-status`: it appeared to fail during the earlier
audit only because it was run concurrently with suites that need a server. Run
alone it passes 10/10. It needs neither a server nor fixtures.

---

## 3. Not executed — and why

These 8 suites **require a running development server** on `http://localhost:3001`
(overridable with `NCC_TEST_BASE_URL`) and most of them **write fixture rows** to
the database.

| Suite | Needs server | Writes fixtures | Reason not run |
|---|---|---|---|
| `access-control` | yes | no | No server; would test the live HTTP surface |
| `attendance-api` | yes | no | No server |
| `attendance-integration` | yes | **yes** | No server; writes fixtures |
| `deactivation` | yes | no | No server |
| `profile-api` | yes | no | No server |
| `registration-integration` | no | **yes** | Writes fixtures — needs a writable local DB and a deliberate decision |
| `user-exposure` | yes | no | No server |

**Why I did not simply start the server and run them.** Starting `next dev`
against `ncc_dev` plus letting the suites write fixtures is a *write operation*
against the development database. The assignment explicitly says to use
read-only inspection and not to run anything that mutates state. Starting a
server would also require the migration chain to be in a known state, which is
exactly what TD-01/02/03 leave unresolved.

### The safety design worth noting

`scripts/helpers/db-suite.mjs:1-12` has an unusually good contract: it **fails**
rather than skips when the database is local but something is missing, because a
skipped suite "reports a green result while it proved nothing." It also reads
`classifyDatabaseTarget` so that a non-local database causes a skip rather than
a run. That is the correct design, and it means these suites are safe to run
later **without** risk of hitting production.

---

## 4. How to run them safely (proposal, not executed)

| Step | Action | Gate |
|---|---|---|
| 1 | Confirm `DATABASE_URL` classifies as local (`127.0.0.1` / `localhost`) | read-only check — already verified: host `127.0.0.1`, db `ncc_dev` |
| 2 | Pay TD-01/02/03 reconciliation or accept that the schema is in a known drifted state | owner decision |
| 3 | Take a verified local backup | done — archive-verified |
| 4 | Start `next dev` on port 3001 in the background | safe, local |
| 5 | Run the 8 suites with `--test-concurrency=1` | writes fixtures, cleans up |
| 6 | Stop the server; confirm fixture cleanup | verify row counts |
| 7 | Record exact results here | — |

Fixture cleanup is ID-scoped (`scripts/helpers/integration.mjs:400-462`), scoped
to a test email prefix and matching IDs — it cannot delete real unit data.

---

## 5. Other checks executed

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **PASS** — exit 0, no output |
| Lint | `npm run lint` | **PASS** — 0 errors, 41 warnings |
| Build | `npm run build` | **PASS** — exit 0, 34 routes + proxy |
| Dependencies | `npm audit --omit=dev` | **PASS** — 0 vulnerabilities |
| Migration checksums | `shasum -a 256` × 4 | All match documented values |
| Local DB reachability | read-only `SELECT 1` | Reachable |
| Dev server | port 3001 listener check | Not running |

---

## 6. What remains unverified

1. The 8 integration suites — no functional HTTP-surface proof this session.
2. The production environment — no access (TD-04).
3. The restore rehearsal for the `ncc_dev` backup — asserted, no on-disk log.
4. The documentation's 281-test claim — **not reproducible as stated.**

A green build does not prove a workflow works. This report does not claim
otherwise.
