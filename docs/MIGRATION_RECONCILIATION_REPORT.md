# Migration Reconciliation — Decision Brief

**Date:** 13 November 2026 · **HEAD:** `96987cf` · **Branch:** `fix/auth-identity`
**Scope:** TD-01, TD-02, TD-03 · **Autonomy:** inspection only. Nothing was applied.

This brief exists so that the **database owner** can make one informed decision.
It does not make that decision. It supersedes nothing — the full analysis in
`docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md` remains the reference, and this
document is the one-page version for the person who has to choose.

---

## 1. The situation in one paragraph

The repository holds eight migrations. Six are applied consistently. One was
edited after it was applied, so its stored checksum no longer matches the file
(TD-01). One was applied by hand without writing a history row (TD-02). One has
never been applied (TD-03, "M1"). Because Prisma refuses a chain containing a
mismatched checksum, **no new migration can be applied to any database in this
state** — including production, once production is verified.

None of this breaks the running application. The application reads the schema,
not the history. The costs are: schema drift, an inability to migrate forward,
and a permanent block on deployment.

---

## 2. Verified facts (re-checked this session)

| Fact | Value | How verified |
|---|---|---|
| Phase 3 file checksum | `9b9c520d85b45ab1f98bec2c0aad803e47860e0c65fa56bd6a28ad49ce5915ce` | `shasum -a 256` |
| Phase 3 stored checksum | `8031ecf36db288041efa2c4d741c12e74e402ba0ceda9b85111f7f745182bac8` | decision matrix line 24 |
| Deactivation file checksum | `4ef0c67312d5a1ca70ffd7b71485e607708d4dbef5704f6a26059801bf1b81c0` | `shasum -a 256` |
| M1 file checksum | `47c3e4b871117ddee309bec0886d454f758a016be2dc0300648c5249f2c2e247` | `shasum -a 256` |
| Migration directories | 8 | `ls prisma/migrations/` |
| Schema drift | exactly 1 enum + 1 column (M1) | `schema.prisma` vs applied state |
| Mismatch is a checksum **or** a replay failure | both; the SQL is not idempotent | `MIGRATION_SAFETY.md` §5.1 |

All four checksums match the values the documentation records. There is no
evidence of file tampering.

---

## 3. Which environments are affected

| Environment | Affected? | Evidence |
|---|---|---|
| Local `ncc_dev` | **Yes** — all three issues | documented + checksums verified |
| Any fresh database | **No** — clean chain applies | chain applies from zero |
| Production | **UNKNOWN** | TD-04: identity unverified, never inspected |

**The production row is the important one.** It may have all three issues, none,
or a different combination. Choosing a reconciliation option before production is
inspected risks applying a fix that is wrong for production. This is why the
decision matrix places Gate 2 (production inspection) before the decision.

---

## 4. The five options, and what each costs

| # | Option | Database touched | Reversible | Prisma-supported | Verdict |
|---|---|---|---|---|---|
| 1 | Leave unresolved | none | n/a | yes | Permanent inability to migrate. Acceptable only if the product is frozen. |
| 2 | Restore the originally applied file | none | yes (re-edit) | **yes** | Recovers the true `8031ecf3…` hash. Loses the later idempotence/`btrim` guard. **Only fully-supported option that leaves the DB untouched.** |
| 3 | Compare-and-swap the checksum | 1 row of `_prisma_migrations` | yes (keep old value) | **no** — hand-written SQL | Works per database. Must be transactional and exactly-one-row. Prisma does not sanction it. |
| 4 | `resolve --rolled-back` + deploy | writes a failed row | **no** | command "works", deploy fails | **REJECTED.** The SQL calls `btrim()` on an enum column; the deploy fails and leaves a *failed* row blocking everything behind it. |
| 5 | Rebuild / baseline history | replaces history | **no** | partially | Destroys per-migration provenance. Not acceptable for a unit with historical attendance. |

**Recommendation (agent's opinion, not a decision):** Option 2 or Option 3.
Option 2 is the only Prisma-supported choice that touches no database, and it
restores reproducibility for fresh databases. Option 3 preserves the newer SQL
at the cost of a hand-written history edit. Option 4 must not be used.

---

## 5. What must happen before any option is executed

| # | Precondition | Status |
|---|---|---|
| 1 | Production identity verified (TD-04) | **NOT MET** |
| 2 | Production migration history inspected (Gate 2) | **NOT MET** |
| 3 | Written owner decision naming the option | **NOT MET** |
| 4 | A verified backup of the target database | **PARTIAL** — `ncc_dev` dump is archive-verified; its restore harness has no on-disk evidence (§8.3 of the backup inventory) |
| 5 | A disposable database for rehearsal | **NOT MET** — creation needs approval |
| 6 | The exact previous checksum recorded before any edit | **NOT MET** |

No precondition is satisfied for production. Only #4 is satisfied for local,
and only at archive level.

---

## 6. Disposable-database rehearsal (proposed, not executed)

The rehearsal proves the chosen option before it is applied anywhere real.

1. Create `ncc_rehearsal_<UTC timestamp>` — a database that is not `ncc_dev`
   and not production.
2. Restore the verified `ncc_dev` dump into it.
3. Confirm the same three discrepancies exist there (checksum row, missing row,
   absent column).
4. Apply the chosen option to the rehearsal database only.
5. Run `migrate status` (must be clean) and `migrate diff` (must be empty).
6. Run the application's test suites against the rehearsal database.
7. Drop the rehearsal database and record the outcome.

`--exit-on-error` is mandatory during restore: without it `pg_restore` reports
warnings, continues, and hides a partial restore.

---

## 7. Verification criteria after approval

| Check | Expected |
|---|---|
| `prisma migrate status` | no pending migrations |
| `_prisma_migrations` row count | 8 (was 6) |
| Phase 3 row checksum | matches the file that was applied |
| Deactivation row | present, checksum `4ef0c673…` |
| M1 row | present, checksum `47c3e4b8…` |
| `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma` | empty script |
| `ApprovalDecisionSource` enum | 3 labels in order: `NONE, AUTOMATIC, ADMINISTRATOR` |
| `User.approvalDecisionSource` | `NOT NULL DEFAULT 'NONE'` |
| Backfill counts | match the pre-migration report (matrix §C.3) |
| Test suite | no new failures |
| Local database | **never** modified during the process |

---

## 8. The decision record — to be completed only when approved

| Field | Value |
|---|---|
| Option chosen | *(empty — owner decision)* |
| Approved by | |
| Environment(s) | |
| Backup identifier used | |
| Exact commands | |
| Expected `_prisma_migrations` change | |
| Rollback plan | |
| Date | |

---

## 9. What the agent did and did not do

**Did:** read all 8 migration directories; recomputed all 4 checksums; compared
schema declarations to migration SQL; identified the missing row; determined the
effect of each option from the documented analysis.

**Did not:** apply any migration; run `migrate resolve`, `migrate deploy`,
`db push` or `reset`; connect to production; inspect `_prisma_migrations` on any
database; create a database; edit a migration file.

Any execution requires the owner's written decision and a separate approval for
the rehearsal database.
