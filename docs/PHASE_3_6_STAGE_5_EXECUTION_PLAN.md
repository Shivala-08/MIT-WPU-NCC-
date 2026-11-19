# Stage 5 execution plan — migration reconciliation

*Planning document. Phase 3.7.1 · nothing in this document has been executed.*

> ### Status correction — Phase 3.8.8
>
> **Stage 5 is NOT complete.** Two of its prerequisites have since been
> satisfied; the rest have not, and the chain has still not been reconciled.
>
> | Prerequisite | Then (as written below) | Now |
> | --- | --- | --- |
> | Fresh verified backup of `ncc_dev` | not taken | **taken and archive-verified** — `ncc_dev-20261107T070354Z.dump`, SHA-256 `047826b7…0cf502` |
> | Restore rehearsal on a scratch database | not done | **reported complete, unevidenced on disk** — treat as unproven |
> | Production inventory | not run | **still not run** |
> | Production vs local comparison | not done | **not done** |
> | Phase 3 checksum decision | not made | **not made** |
> | M1 backfill prediction for production | not done | **not done** |
>
> **The current blocker is administrator-provided production access.** It is
> not a missing backup and not a repository defect. Gate 1A passed, Gate 1B is
> reported, Gate 2A and 2B are blocked, and Gate 2 is not executed. See
> `docs/PHASE_3_8_EXECUTION_RECORD.md` for the gate record and the remaining
> closure sequence.
>
> Sections 0–8 below are preserved as written. Where a section states a
> prerequisite is unmet, read it against the table above; the historical
> findings, discrepancy analysis and unapproved commands remain accurate and
> are not withdrawn.

This document describes **what has to happen** before the migration chain of
the unit can be reconciled. It is a plan, not a permission. No step of it has
been carried out, and no step of it may be carried out without the explicit
approval of the owner of the database.

Every statement in this document is labelled:

| Label | Meaning |
| --- | --- |
| **verified** | read from the live database, from the files on disk or from the output of a command that was actually run |
| **inference** | derived from the verified facts, with the reasoning shown |
| **proposed** | an action that is proposed but not authorised |

---

## 0. The state that the plan starts from

### 0.1 The chain (verified)

`prisma/migrations/` holds eight migrations. Prisma 6.19.3 is the version of
this repository.

| # | Migration | On disk (SHA-256) | In `_prisma_migrations` (local) | State |
| --- | --- | --- | --- | --- |
| 1 | `20261026000000_core_tables` | `fe3db57a…2d12e5` | `fe3db57a…2d12e5` | applied, checksum matches |
| 2 | `20261027000000_init_baseline` | `64797f0c…ddc871` | `64797f0c…ddc871` | applied, checksum matches |
| 3 | `20261029000000_account_approval_and_roster` | `29112131…c92338` | `29112131…c92338` | applied, checksum matches |
| 4 | `20261030000000_cadet_profile_completion` | `7453b4c5…7920d9` | `7453b4c5…7920d9` | applied, checksum matches |
| 5 | `20261030080432_phase3_attendance_operations` | `9b9c520d…5915ce` | `8031ecf3…82bac8` | **applied, checksum differs** |
| 6 | `20261030210643_phase3_manual_fallback_code` | `98ded183…453d6d` | `98ded183…453d6d` | applied, checksum matches |
| 7 | `20261101090000_account_deactivation` | `4ef0c673…1b81c0` | *no row* | **effects applied, row missing** |
| 8 | `20261105000000_approval_decision_source` | `47c3e4b8…2e247` | *no row* | **not applied** |

### 0.2 The local database (verified)

| Property | Value |
| --- | --- |
| connection | `postgresql://pallav@127.0.0.1:5432/ncc_dev` (loopback, local development target) |
| server | PostgreSQL 18.6 (Homebrew), `aarch64-apple-darwin25.6.0` |
| database size | 10 639 039 bytes |
| rows | `User` = 1, every other table = 0 |
| `_prisma_migrations` | 6 rows, the original six, with their original checksums and timestamps |
| the one account | `dev-admin@ncc-mitwpu.edu.in`, role `ADMIN`, `approvalStatus = APPROVED`, no `approvedById`, no `rosterId` |

### 0.3 What Prisma itself reports (verified, `prisma migrate status`)

```
8 migrations found in prisma/migrations
Following migrations have not yet been applied:
20261101090000_account_deactivation
20261105000000_approval_decision_source
```

The command did **not** report the phase 3 checksum as an error. The mismatch
is therefore visible in the history table and in `migrate diff`, but it is not
reported by `migrate status` in this version.

### 0.4 What the schema says (verified, `prisma migrate diff --from-url … --to-schema-datamodel …`)

The live database differs from `prisma/schema.prisma` **only** by the changes
of migration 8:

```
[+] Added enums
  - ApprovalDecisionSource

[*] Changed the `User` table
  [+] Added column `approvalDecisionSource`
```

**Inference.** The effects of migration 7 (the account deactivation) are
complete and correct in the live database: the three columns, the index and
both foreign keys are present, and no other part of the schema has drifted.
Migration 8 is the only outstanding schema change. The detail is in
`docs/MIGRATION_EQUIVALENCE_ANALYSIS.md`, sections 3, 6 and 12.

### 0.5 The guard (verified)

`scripts/prisma-guard.mjs` classifies the commands as follows:

| Command | Against the local database | Against any other target |
| --- | --- | --- |
| `migrate status`, `migrate diff`, `generate`, `validate`, `version`, `format`, `debug` | allowed | allowed (read-only) |
| `migrate deploy`, `migrate resolve` | allowed | **blocked** unless `PRISMA_ALLOW_PRODUCTION=1` |
| `exec` and the other development-only commands | allowed | **blocked** unless `PRISMA_ALLOW_PRODUCTION=1` |

The write commands against a production target are therefore refused by
default and have to be authorised twice: by the owner of the database and by
the explicit environment flag.

---

## 1. Step 1 — Backup

### 1.1 Why the existing backup cannot be used (verified)

| Backup | State | Why it cannot be the rollback point |
| --- | --- | --- |
| `ncc-dev-pre-deactivation-20261102-024155.dump` (documented in `docs/MIGRATION_SAFETY.md` §5.6) | **does not exist on this machine** | a filesystem search found no file with this name. The rollback point that the safety document describes is missing. `docs/PHASE_3_8_BACKUP_INVENTORY.md` reached the same conclusion independently. |
| `/Users/pallav/ncc-backups/ncc-public-20261028-023444.dump` (the only surviving PostgreSQL dump) | taken 2026-10-28 02:34, archive header says `dbname: postgres`, 72 TOC entries | it predates migrations 3, 4, 5, 6, 7 and 8. Its schema holds no `Roster`, no `LeaveRequest`, no `AttendanceManualCode`, no `AttendanceQrToken` and no `deactivatedAt`. It is not a snapshot of the current `ncc_dev`. |
| `ncc-sqlite-backup-20261021-213901.db` | **does not exist on this machine** | a filesystem search found no file with this name. |
| `prisma/dev.db` | SQLite, 135 168 bytes, last written 2026-10-18, 12 tables | the database of the era before the move to PostgreSQL. The datasource of `prisma/schema.prisma` is `postgresql`. It cannot be restored into `ncc_dev`. |

**Inference.** There is currently **no usable rollback point** for the
reconciliation. Step 1 is not a formality; it is the only thing that makes
steps 3 to 6 reversible.

### 1.2 The fresh backup (proposed)

```bash
# 1. the directory and the name
BACKUP_DIR="$HOME/ncc-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/ncc-dev-pre-stage5-$STAMP.dump"
mkdir -p "$BACKUP_DIR"

# 2. the dump itself (custom format, so that pg_restore can select)
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$TARGET" \
  --dbname="postgresql://pallav@127.0.0.1:5432/ncc_dev"

# 3. the integrity check: the table of contents has to be readable
pg_restore --list "$TARGET" > "$TARGET.list"
```

`pg_dump` writes to the file; it never writes to the database, so it is safe
to take this backup without a further approval for a *database write*. It is
still an action on the data of the unit and it is proposed here, not performed.

### 1.3 The verification of the dump (proposed)

The dump is only a rollback point when it can be read back. The minimum proof
is the table of contents:

```bash
pg_restore --list "$TARGET" | grep -c "TABLE DATA"
pg_restore --list "$TARGET" | grep "deactivatedAt\|CadetProfile_userId_fkey\|AttendanceSession"
```

The list has to contain **every table of the current database**, including
`User` with its three deactivation columns, `CadetProfile`, `Roster`,
`Attendance`, `AttendanceSession`, `LeaveRequest` and `AuditLog`.

The stronger proof is a real restore into a scratch database that is created
for the purpose and dropped afterwards. **A disposable database is not
created by this stage and its creation needs its own approval** (the same
rule that `docs/MIGRATION_SAFETY.md` §5.5 states for the validation of the
chain).

### 1.4 The identity of the database (proposed)

The identity of the database has to be written down next to the dump, because
a backup without its identity cannot be matched to a database later.

```sql
SELECT current_database()                AS database_name,
       current_user                      AS database_user,
       inet_server_addr()                AS server_address,
       inet_server_port()                AS server_port,
       version()                         AS server_version,
       pg_database_size(current_database()) AS size_bytes,
       now()                             AS recorded_at;

SELECT migration_name, checksum, started_at, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY started_at;

SELECT count(*) AS users FROM "User";
SELECT count(*) AS audit_rows FROM "AuditLog";
```

The output of these queries belongs in the stage 5 report of the run.

### 1.5 The restore procedure (proposed)

```bash
# 1. a database that is created for the purpose
createdb ncc_dev_restore_check

# 2. the restore
pg_restore --no-owner --no-privileges --dbname=ncc_dev_restore_check "$TARGET"

# 3. the comparison
psql "postgresql://pallav@127.0.0.1:5432/ncc_dev_restore_check" \
  -c 'SELECT count(*) FROM "User"; SELECT count(*) FROM "_prisma_migrations";'

# 4. the cleanup
dropdb ncc_dev_restore_check
```

The restore has to reproduce the same row counts and the same six migration
rows with the same checksums. Only then is the dump a rollback point.

### 1.6 The retention (proposed)

| Dump | Keep until |
| --- | --- |
| the new `ncc-dev-pre-stage5-<stamp>.dump` | the reconciliation is verified in production **and** one full operating cycle has passed |
| the new dump's `.list` file | as long as the dump |
| `ncc-public-20261028-023444.dump` | it is of no further use for this purpose; keeping it costs nothing, but it must not be mistaken for a rollback point |

---

## 2. Step 2 — Production inventory

### 2.1 The query (proposed — read-only, to be run by the operator)

```sql
SELECT
    migration_name,
    checksum,
    started_at,
    finished_at,
    rolled_back_at
FROM "_prisma_migrations"
ORDER BY started_at;
```

It is read-only: it selects from one table and writes nothing. It should be
run with a connection that has no write permission, so that an accident is
impossible.

### 2.2 The comparison with the local history (proposed)

The result is compared with the table of section 0.1, row by row. Three
outcomes are possible, and each one leads to a different path.

| Production result | Meaning | Consequence |
| --- | --- | --- |
| the same six rows with the same checksums, and nothing for migrations 7 and 8 | the production database has the same history as the local one | the production database was migrated with the same files; the same reconciliation applies to it |
| the same six rows, but with a **different** checksum for the phase 3 migration | production was migrated with a different version of the file than the local one | the production file has to be recovered and compared **before** anything is done; the local analysis does not transfer |
| a **different set** of rows | production has its own history | the reconciliation has to be planned again for production; the local plan does not apply |

**Proposal.** The comparison is written down as a table with the same shape as
the table of section 0.1, and the result decides which of the paths above is
taken.

### 2.3 The schema of production (proposed — read-only)

The history alone does not prove that the schema matches the history. The
following read-only queries give the proof:

```sql
-- the objects of the deactivation migration
SELECT column_name FROM information_schema.columns
WHERE table_name = 'User'
  AND column_name IN ('deactivatedAt','deactivatedById','deactivationReason','approvalDecisionSource');

SELECT indexname FROM pg_indexes WHERE indexname = 'User_deactivatedAt_idx';

SELECT conname, confdeltype FROM pg_constraint
WHERE conname IN ('User_deactivatedById_fkey','CadetProfile_userId_fkey');

-- the type of migration 8
SELECT typname FROM pg_type WHERE typname = 'ApprovalDecisionSource';
```

The expected result of the first query is the three deactivation columns
**without** `approvalDecisionSource`; the expected result of the last query is
**no row**. A different result changes the plan.

### 2.4 The boundary (verified)

This stage did **not** connect to production. No connection string of a
production host was read, no host was resolved and no query was sent. The
production inventory is an action of the operator, on a production console,
with a production connection, and its result comes back as text.

---

## 3. Step 3 — The account deactivation migration

### 3.1 The command (proposed)

```bash
PRISMA_ALLOW_PRODUCTION=1 \
  node scripts/prisma-guard.mjs migrate resolve --applied 20261101090000_account_deactivation
```

The guard refuses this command against a production target without the
explicit flag, so the approval has to be given twice: once in the decision of
the owner, once in the flag.

### 3.2 What the command does (verified in `docs/MIGRATION_SAFETY.md` §5.4, confirmed against the test suite of Prisma at tag `6.19.3`)

| Situation | Result |
| --- | --- |
| the migration has **no row** in `_prisma_migrations` | **succeeds.** A row is added with the checksum of the file on disk (`4ef0c673…1b81c0`), `finished_at` set, `rolled_back_at` null. **The SQL of the file is not executed.** |
| the migration is already recorded as applied | fails with `P3008` and does **not** refresh the checksum |
| the migration is in a failed state | succeeds and closes the failed row |
| the migration file does not exist | fails with `P3017` |

**The command is only appropriate when the target database already contains
all the expected schema effects of the file.** It records a fact; it does not
create it. If the schema is missing an effect, `migrate resolve` would record
a lie, and the gap would only surface later.

### 3.3 The verification that has to run **before** the command (proposed)

Every effect of the file has to be present, with the exact definition of the
file. For the local database all of them are already confirmed (verified,
section 0.4):

| Effect of the file | Expected | How it is checked |
| --- | --- | --- |
| `User.deactivatedAt` | `timestamp(3)`, nullable | `information_schema.columns` |
| `User.deactivatedById` | `text`, nullable | `information_schema.columns` |
| `User.deactivationReason` | `text`, nullable | `information_schema.columns` |
| `User_deactivatedAt_idx` | index on `("deactivatedAt")` | `pg_indexes` |
| `User_deactivatedById_fkey` | foreign key to `User(id)`, `ON DELETE SET NULL`, `ON UPDATE CASCADE` | `pg_constraint` (`confdeltype = 'n'`) |
| `CadetProfile_userId_fkey` | foreign key to `User(id)`, `ON DELETE RESTRICT`, `ON UPDATE CASCADE` | `pg_constraint` (`confdeltype = 'r'`) |
| the migration row | **absent** | `SELECT count(*) FROM "_prisma_migrations" WHERE migration_name = '20261101090000_account_deactivation'` → must be `0` |

The last row is the important one: the command fails with `P3008` if a row
already exists, and the check turns a failure into a decision.

### 3.4 The consequence of the command (proposed)

| After `migrate resolve --applied` | Value |
| --- | --- |
| `_prisma_migrations` | 7 rows — the six original rows plus one row for the deactivation |
| the checksum of the new row | `4ef0c673…1b81c0`, the checksum of the file on disk |
| the schema | **unchanged** — the SQL was not executed |
| `prisma migrate status` | the deactivation is no longer pending; only migration 8 is pending |
| the rows of the unit | **unchanged** |

### 3.5 The rollback of this step (proposed)

The command writes one row. The rollback is the removal of that row, which is
a manual write to `_prisma_migrations` and therefore **not** a supported
operation. The practical rollback is the restore of the backup of step 1.

---

## 4. Step 4 — The reconciliation of the phase 3 checksum

### 4.1 The situation (verified)

| | |
| --- | --- |
| the checksum stored in the database | `8031ecf3…82bac8` |
| the checksum of the file on disk | `9b9c520d…5915ce` |
| the difference | the data section: the applied file had **one** statement at position 7, the file on disk has **three** at positions 5, 6 and 9. The applied `UPDATE "Attendance" SET "status" = 'ABSENT' …` is **absent** from the file on disk. |
| the DDL | **all 30 statements are byte identical, in the same order** (verified by an independent parse of both files) |
| the effect on the schema | **none** — the two files produce the same schema |
| the provenance of the applied file | a byte exact reconstruction whose SHA-256 is the stored checksum. The file is **not** tracked by git, so the reconstruction is the only copy that exists. |

The full comparison is in `docs/MIGRATION_EQUIVALENCE_ANALYSIS.md`, sections 3.2 and 3.3.

### 4.2 The options

**No option is chosen here.** The options are presented so that the decision
can be made with all of the consequences in view.

#### Option A — Leave the stored checksum as it is

| Question | Answer |
| --- | --- |
| **What it changes** | nothing. The history keeps the checksum of the file that was really applied. |
| **What it preserves** | the truth of the history. The stored checksum is the only proof that the applied file was the reconstructed one. |
| **Risks** | the mismatch stays. `migrate dev` in development compares the history with the files and will report the migration as modified, and it may then want to reset the database — a reset would destroy the data of the unit. Every future reader of the history has to be told why the checksum differs. **One claim in the repository is disputed and has to be settled before this option is chosen:** `docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md` states that a modified applied migration *"stops the chain before anything is applied"* and that the databases *"stay refused for `migrate deploy`"*. That claim is attributed to `docs/MIGRATION_SAFETY.md` §5, but §5 does not make it: §5.1 speaks about the two migrations that cannot be **replayed**, not about a checksum comparison. The observation of this stage contradicts the general form of the claim: `prisma migrate status` ran on the local database **with the mismatch present**, completed normally and reported the two pending migrations without mentioning the checksum. Whether `migrate deploy` refuses the chain is **not verified** — it cannot be tested without running a deploy, which is prohibited. |
| **Prisma support** | fully supported. Nothing is written and nothing is rewritten. |
| **A fresh database** | unaffected. The fresh database computes its own checksum from the file on disk (`9b9c520d…5915ce`) and applies the safer file. Its history row therefore differs from the history row of the existing database. That is correct: the two databases really were migrated with different files. |
| **An existing database** | unaffected by the decision itself. The migration is recorded as applied and is not replayed. |

#### Option B — Rewrite the one history row to the checksum of the file

| Question | Answer |
| --- | --- |
| **What it changes** | one row of `_prisma_migrations`: the checksum of the phase 3 migration becomes `9b9c520d…5915ce`. |
| **What it preserves** | the schema, the rows of the unit, the other five history rows. |
| **Risks** | **it destroys the evidence.** The stored checksum `8031ecf3…82bac8` is the only proof that the applied file was the reconstruction; after the rewrite that proof is gone. It is a manual write to the history table, which the guard of this repository classifies as a write and which Prisma offers no command for. If the two files were ever compared again, the difference would be invisible. |
| **Prisma support** | **no.** `migrate resolve --applied` fails with `P3008` because the migration is already recorded, and it does not refresh the checksum. `migrate resolve --rolled-back` fails with `P3012` because the migration is not in a failed state. There is no supported path. |
| **A fresh database** | unaffected. A fresh database still computes `9b9c520d…5915ce` from the file. The rewrite only aligns the existing database with it. |
| **An existing database** | its history becomes consistent with the files. `migrate dev` stops reporting the migration as modified. |

#### Option C — Restore the file that was applied

| Question | Answer |
| --- | --- |
| **What it changes** | the file `prisma/migrations/20261030080432_phase3_attendance_operations/migration.sql` is replaced by the reconstruction whose SHA-256 is `8031ecf3…82bac8`. The file and the history agree again, without any write to the database. |
| **What it preserves** | the history completely, and the schema: the 30 DDL statements of the two files are byte identical. |
| **Risks** | **the safety work of phase 3.5.3 is lost.** The restored file carries the old data transformation — the `UPDATE … SET status = 'ABSENT'` that guesses instead of stopping — and it does not carry the guard, the canonicalisation or the metadata block. The tests of `scripts/migration-attendance-status.test.mjs` assert exactly those properties of the file and would fail. The reconstruction is not tracked by git: its provenance would have to be re-proved from the checksum alone. |
| **Prisma support** | supported. The file matches the recorded checksum, so Prisma considers the history consistent and does not replay the migration. |
| **A fresh database** | **this is the decisive drawback.** A fresh database would apply the restored file and would therefore get the old, unsafe behaviour: no guard on an unsupported status, no canonicalisation and no backfill of the marking metadata. The chain would still apply cleanly. |
| **An existing database** | its history stays consistent. The file is not replayed. |

#### Options that are not available

| Option | Why it is not available |
| --- | --- |
| `migrate resolve --applied` on the phase 3 migration | fails with `P3008`; it does not refresh a checksum of an applied migration. |
| `migrate resolve --rolled-back` on the phase 3 migration | fails with `P3012`; the migration is applied and successful, not failed. |
| `migrate reset` and re-apply the chain | destroys the data of the unit and is prohibited. |
| rebuild or baseline the history from `schema.prisma` | collapses the eight migrations into one synthetic row. The provenance of every migration is lost, and every existing database needs its own `resolve --applied` for the baseline. It is presented as option 5 of `docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md` and is not recommended there either. |
| Editing the file until its SHA-256 becomes `8031ecf3…82bac8` | that is option C. A different file with the same SHA-256 is a preimage attack on SHA-256 and does not exist. |

### 4.3 What has to happen before the decision

| Question | How it is answered |
| --- | --- |
| does production hold the same checksum for the phase 3 migration? | the inventory of step 2 |
| **does `migrate deploy` refuse a chain that carries a modified applied migration?** | **not verified.** It cannot be tested without a deploy, which is prohibited. It has to be settled from the documentation of Prisma 6.19.3, or in a scratch database that is created for the purpose and dropped afterwards — which needs its own approval. The answer decides whether option A is viable at all. |
| does the reconstruction still hash to `8031ecf3…82bac8`? | `shasum -a 256` against the file that the stage 5 run uses |
| is the checksum of the stored row the only proof of the applied file? | yes — the file is not tracked by git |
| what does the decision cost the phase 3.5.3 safety work? | option C costs it; options A and B keep it |
| which option does the owner of the project accept? | a decision of the owner, not of this stage |

### 4.4 The other documents of the unit

Five further documents of the reconciliation exist in `docs/`. They were
written by other stages and they are **not** superseded by this plan; this
plan does not modify them.

| Document | Relation to this plan |
| --- | --- |
| `docs/PHASE_3_8_BACKUP_INVENTORY.md` | the gate 1 of the backup. It reached the same conclusion as section 1.1 of this plan: the documented dump does not exist and `~/ncc-backups/` holds exactly one file. |
| `docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md` | the gate 4 of the checksum. It presents five options; this plan presents three of them (A = option 1, B = option 3, C = option 2) and lists options 4 and 5 as not available. **Its claim that the mismatch stops the chain is disputed in section 4.2 and has to be settled.** |
| `docs/PHASE_3_8_PRODUCTION_MIGRATION_INVENTORY.md` | the gate 2 of the production inventory, with a larger read-only query set than section 2 of this plan. |
| `docs/PHASE_3_8_ADMIN_ACCESS_REQUEST.md` | the request for the access to the production console that section 2 needs. |
| `docs/PHASE_3_6_PRODUCTION_READINESS_CHECKLIST.md` | an earlier checklist of the production readiness, with the same items as `docs/PRODUCTION_READINESS_CHECKLIST.md`. |

---

## 5. Step 5 — The M1 migration `20261105000000_approval_decision_source`

### 5.1 What the migration does (verified)

| Step | Statement | Effect |
| --- | --- | --- |
| 1 | `CREATE TYPE "ApprovalDecisionSource" AS ENUM ('NONE','AUTOMATIC','ADMINISTRATOR')` | the type is created |
| 2 | `ALTER TABLE "User" ADD COLUMN "approvalDecisionSource" "ApprovalDecisionSource" NOT NULL DEFAULT 'NONE'` | the column is created with the default `NONE` |
| 3 | `UPDATE "User" SET "approvalDecisionSource" = 'ADMINISTRATOR' … WHERE "approvedById" IS NOT NULL` | every account that an administrator decided is marked as such |
| 4 | `UPDATE "User" SET "approvalDecisionSource" = 'AUTOMATIC' … WHERE "approvalStatus" = 'APPROVED' AND "approvedById" IS NULL AND "rosterId" IS NOT NULL` | every account that the roster approved is marked as such |

The migration is additive: no row is deleted, no existing column is changed.

### 5.2 The pre-migration checks (proposed)

| Check | Expected | Query |
| --- | --- | --- |
| the type does not exist yet | no row | `SELECT typname FROM pg_type WHERE typname = 'ApprovalDecisionSource';` |
| the column does not exist yet | no row | `SELECT column_name FROM information_schema.columns WHERE table_name='User' AND column_name='approvalDecisionSource';` |
| the backup of step 1 exists and verifies | the table of contents is readable | `pg_restore --list` |
| the history of the target is known | the six or seven rows of the inventory | the query of step 2 |
| the application understands the column | the code reads the column and the type exists in `prisma/schema.prisma` | `grep approvalDecisionSource prisma/schema.prisma` |

**Verified for the local database:** the type and the column are both absent,
so the migration has never run there.

### 5.3 The backfill verification (proposed)

The two `UPDATE` statements of the migration are the part that carries the
meaning. Their effect has to be predicted **before** the migration runs, and
compared **after** it ran. The prediction is made with a read-only `SELECT`
that uses the same predicates:

```sql
SELECT
  count(*) FILTER (WHERE "approvedById" IS NOT NULL) AS will_be_ADMINISTRATOR,
  count(*) FILTER (WHERE "approvalStatus" = 'APPROVED'
                     AND "approvedById" IS NULL
                     AND "rosterId" IS NOT NULL)                AS will_be_AUTOMATIC,
  count(*) FILTER (WHERE "approvedById" IS NULL
                     AND NOT ("approvalStatus" = 'APPROVED'
                              AND "approvedById" IS NULL
                              AND "rosterId" IS NOT NULL))       AS will_be_NONE
FROM "User";
```

**Verified for the local database:** `will_be_ADMINISTRATOR` = 0,
`will_be_AUTOMATIC` = 0, `will_be_NONE` = 1. The single account of the local
database (`dev-admin@ncc-mitwpu.edu.in`, `APPROVED`, no approver, not on the
roster) would receive the source `NONE`.

That is the intended semantics of the migration — the column says **who**
decided, and nobody decided that account in the sense of the migration: it was
approved, but neither by an administrator nor by the roster. It is worth
confirming that this is also the expected history of the account, because a
value of `NONE` on an approved account makes the application treat the
decision as still open.

### 5.4 The execution (proposed)

Only after step 3 succeeded, the backup of step 1 verified and the checks of
5.2 passed:

```bash
PRISMA_ALLOW_PRODUCTION=1 \
  node scripts/prisma-guard.mjs migrate deploy
```

`migrate deploy` applies the pending migrations in the order of their
directory names. At that point migration 7 is recorded (by step 3) and
migration 8 is the only pending one, so the deploy applies **migration 8
only**.

### 5.5 The post-migration schema verification (proposed)

| Check | Expected |
| --- | --- |
| `SELECT typname FROM pg_type WHERE typname = 'ApprovalDecisionSource';` | one row |
| `information_schema.columns` for `User.approvalDecisionSource` | one row, type `ApprovalDecisionSource`, `is_nullable = NO`, default `'NONE'` |
| `SELECT count(*) FROM "_prisma_migrations"` | 8 rows on the local database |
| the new row of migration 8 | checksum `47c3e4b8…2e247`, `finished_at` set, `rolled_back_at` null |
| `prisma migrate status` | no pending migration |
| `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma` | empty output |

### 5.6 The application compatibility tests (proposed)

| Test | What it proves |
| --- | --- |
| `npm test` | the whole suite, including the 101 PostgreSQL tests and the 3 rollback tests of the audit trail |
| `npm run test:attendance` | the attendance rules |
| `scripts/deactivation.test.mjs` | the deactivation lifecycle against the real database |
| `scripts/approval-integration.test.mjs` | the approval of an administrator and the automatic approval of the roster |
| `scripts/account-service.test.mjs` | the rules of the approval service |
| a manual check of the decision source | an account that an administrator decided shows `ADMINISTRATOR`; an account that the roster approved shows `AUTOMATIC`; an account that nobody decided shows `NONE`; **an account that an administrator put back into `PENDING` is never approved automatically by a later sign in** |

### 5.7 The rollback of this step (proposed)

| Situation | Rollback |
| --- | --- |
| the migration failed and the transaction rolled back | nothing to undo. The migration runs in a transaction; a failure leaves the schema unchanged. |
| the migration succeeded and the backfill is wrong | the column is the only thing that was added. The rollback is the restore of the backup of step 1, or a corrective `UPDATE` of the column — a manual write that needs its own approval. |
| the application misbehaves with the column present | the column is nullable-free but has a default, so the application can be paused without a data change. The restore of the backup is the safe rollback. |

The M1 migration has **no down migration**. The restore of step 1 is the only
clean way back.

---

## 6. Step 6 — The final verification

### 6.1 The migration status (proposed)

```bash
node scripts/prisma-guard.mjs migrate status
```

Expected: no pending migration, and — depending on the decision of step 4 —
either a consistent history or a history with the one known difference.

### 6.2 The schema drift (proposed)

```bash
node scripts/prisma-guard.mjs migrate diff \
  --from-url "postgresql://pallav@127.0.0.1:5432/ncc_dev" \
  --to-schema-datamodel prisma/schema.prisma
```

Expected: **empty output**. A non-empty output names the exact drift.

### 6.3 The indexes (proposed)

```sql
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

The list is compared with the index statements of the chain: the 11 index
statements of the phase 3 migration, the index of the manual fallback code,
the index of the deactivation and the indexes of the earlier migrations.

### 6.4 The foreign keys (proposed)

```sql
SELECT conname, conrelid::regclass AS on_table, confrelid::regclass AS references, confdeltype
FROM pg_constraint
WHERE contype = 'f'
ORDER BY conrelid::regclass::text, conname;
```

The two critical entries are `CadetProfile_userId_fkey` with `confdeltype =
'r'` (RESTRICT) and `User_deactivatedById_fkey` with `confdeltype = 'n'`
(SET NULL). A change of either one would break the preservation of the
history of the unit.

### 6.5 The enum types (proposed)

```sql
SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
GROUP BY t.typname
ORDER BY t.typname;
```

Expected: the types of the chain (`UserRole`, `ApprovalStatus`,
`AttendanceStatus`, `AttendanceMethod`, `ApprovalDecisionSource`) and their
labels.

### 6.6 The behaviour of the approval decision (proposed)

| Case | Expected |
| --- | --- |
| an account that nobody decided | `NONE`, and the automatic approval of a later sign in is possible |
| an account that the roster approved | `AUTOMATIC` |
| an account that an administrator approved | `ADMINISTRATOR` |
| an account that an administrator put back into `PENDING` | `ADMINISTRATOR`, and **no later sign in may approve it automatically** |
| a new account that a Google sign in creates | `NONE` until the roster decides |

### 6.7 The tests of the application (proposed)

```bash
npm test
npm run test:attendance
npm run lint
npx tsc --noEmit
npm run build
```

The expected result is the result of phase 3.7.1: 281 tests, 281 pass, 0
skipped; 88 attendance tests, 88 pass; lint with 0 errors; TypeScript clean;
the build with 58 static pages.

### 6.8 The retention of the backup (proposed)

| Point in time | The backup of step 1 |
| --- | --- |
| the day of the reconciliation | kept, and its verification is recorded |
| after the production reconciliation is verified | kept until one full operating cycle has passed |
| after that | the decision to keep or delete it is the decision of the owner; the dump file and its `.list` file have to be deleted together |

---

## 7. What Stage 5 needs before it can begin

**Status as of Phase 3.8.8.** Rows 2 and 3 have moved; everything else is
unchanged. The dominant blocker is row 4 — production access from the
administrator.

| # | Requirement | State |
| --- | --- | --- |
| 1 | the approval of the owner of the database for the write operations | **not given** |
| 2 | a fresh backup of `ncc_dev`, verified with `pg_restore --list` | **SATISFIED** — `ncc_dev-20261107T070354Z.dump`, 49,602 bytes, SHA-256 `047826b7…0cf502`, `pg_restore --list` exit 0, 21 tables / 6 enums / 49 indexes / 14 FKs / 3 triggers / 2 functions / 6 history rows |
| 3 | the restore procedure proved on a scratch database | **REPORTED, NOT EVIDENCED** — rehearsal in `ncc_restore_verify_20261107` reported successful, but the manifest still says `restore_tested: false` and no log exists; re-run under its own approval before relying on it |
| 4 | the production inventory | **not run** — **this is the current blocker**; no production identity, no read-only role and no credential configured |
| 5 | the comparison of the production history with the local history | **not done** — depends on 4 |
| 6 | the comparison of the production schema with the expected schema | **not done** — depends on 4 |
| 7 | the decision about the phase 3 checksum | **not made** |
| 8 | the prediction of the M1 backfill for the target database | **done for the local database**, **not done for production** |
| 9 | `PRISMA_ALLOW_PRODUCTION=1` for the write commands | **not set** |
| 10 | the `AUDIT_HASH_KEY` of the production deployment | **not configured** — every audit write in production is refused until it is |

**Stage 5 is not complete and must not be marked complete.** The three local
discrepancies (phase 3 checksum, missing deactivation row, unapplied M1) remain
open and uncorrected; see §0.1 and
`docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md`.

## 8. The commands of this stage

Every command that this stage ran was read-only with respect to the
database:

| Command | Effect |
| --- | --- |
| `prisma migrate status` (through the guard) | reads the history table |
| `prisma migrate diff --from-url … --to-schema-datamodel …` (through the guard) | reads the catalog |
| `pg_restore --list` on the existing dump | reads a file |
| `SELECT` queries against `ncc_dev` | read rows |
| the test suites | write their own fixtures and remove them again |

No migration was applied, no `migrate resolve` was run, no `db push` was run,
no checksum was changed, no row of `_prisma_migrations` was written, no
disposable database was created and production was not accessed.
