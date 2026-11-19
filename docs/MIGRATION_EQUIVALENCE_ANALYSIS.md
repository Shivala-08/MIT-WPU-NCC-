# Migration equivalence analysis

*Phase 3.6, corrected in phase 3.7 · prerequisite of any database operation (stage 5)*

The corrections of the phase 3.7 change no statement of any migration. They
correct the counting of the statements, the description of the difference
between the two files of the phase 3, the separation of the verified and the
reconstructed evidence, the accounting of the tests and the description of
the key of the email references of the audit trail.

This document answers one question: **is the SQL that is on disk today the SQL
that was applied to the databases, and what changes if the chain is applied
again?**

The question has to be answered before any migration is applied, because the
phase 3 migration was edited after it was applied. This analysis is read-only.
No migration was applied, no checksum was rewritten, no `_prisma_migrations`
row was changed and no production database was touched.

---

## 1. Method

| Step | What was done | How it was verified |
| --- | --- | --- |
| 1. Inventory of the chain | every directory of `prisma/migrations/` was listed and hashed with `sha256` | `shasum -a 256` |
| 2. Inventory of the applied state | the table `_prisma_migrations` of the local development database was read | `SELECT migration_name, checksum, started_at, finished_at, rolled_back_at …` |
| 3. Recovery of the applied file | the original content of the phase 3 file was reconstructed from the session history of the run that created it | the SHA-256 of the reconstruction is **identical** to the checksum stored in the database |
| 4. Statement level comparison | both files were split into statements (dollar quoted blocks aware) and compared | 30 of 30 DDL statements are byte identical, including their internal whitespace; the data section changes from one statement to three and the position of the data statements changes |
| 5. Effect on an existing and on a fresh database | derived from the statements and from the catalog of the local database | `pg_constraint`, `pg_indexes`, `\d "User"` |
| 6. The state of the other migrations | compared with the catalog and with `prisma migrate status` | `node scripts/prisma-guard.mjs migrate status` (a read-only command) |

### 1.1 The two classes of evidence

Every statement of this document is backed by one of two kinds of evidence.
They are never mixed.

| Class | Meaning | Examples |
| --- | --- | --- |
| **V — verified** | read from the live database of the development machine or from the files on disk while the analysis was made | the six rows of `_prisma_migrations` with their checksums and their timestamps; the objects of the phase 3 migration in the catalog (`pg_type`, `pg_class`, `pg_indexes`, `pg_constraint`); the sha256 of every file of the chain; the absence of the column `User.approvalDecisionSource` and of the type `ApprovalDecisionSource`; the presence of the objects of the deactivation migration without their row in `_prisma_migrations` |
| **R — reconstructed** | recovered from the session history of the run of 2026-10-30, because the file was edited after it had been applied | the exact bytes of the applied phase 3 file; the text and the position of its one data statement |

The reconstruction is not a guess. The SHA-256 of the reconstruction is
`8031ecf36db288041efa2c4d741c12e74e402ba0ceda9b85111f7f745182bac8`, which is
the checksum that Prisma itself computed and stored when it applied the
migration. The byte content of the applied file is therefore **proven**.

What the reconstruction cannot prove is the **effect** of the applied data
statement: the table `Attendance` holds no rows today, so no historical row
survives that could show what the statement did to it. The behaviour of the
applied statement is therefore derived from its text (class R), while the
schema it produced is verified in the catalog (class V).

---

## 2. The chain and its state

| Migration directory | SHA-256 of the file on disk | Recorded in `_prisma_migrations` | State of the local development database |
| --- | --- | --- | --- |
| `20261026000000_core_tables` | `fe3db57a…d12e5` | `fe3db57a…d12e5` | applied, checksum matches |
| `20261027000000_init_baseline` | `64797f0c…0ddc871` | `64797f0c…0ddc871` | applied, checksum matches |
| `20261029000000_account_approval_and_roster` | `29112131…92338` | `29112131…92338` | applied, checksum matches |
| `20261030000000_cadet_profile_completion` | `7453b4c5…920d9` | `7453b4c5…920d9` | applied, checksum matches |
| `20261030080432_phase3_attendance_operations` | `9b9c520d…5915ce` | `8031ecf3…82bac8` | **applied, the file was edited afterwards** |
| `20261030210643_phase3_manual_fallback_code` | `98ded183…536d6d` | `98ded183…536d6d` | applied, checksum matches |
| `20261101090000_account_deactivation` | `4ef0c673…1b81c0` | **not recorded** | **the schema of the migration is present, the row is missing** |
| `20261105000000_approval_decision_source` | `47c3e4b8…2e247` | not recorded | **not applied** (the column does not exist) |

`node scripts/prisma-guard.mjs migrate status` reports exactly that:

```
8 migrations found in prisma/migrations
Following migrations have not yet been applied:
20261101090000_account_deactivation
20261105000000_approval_decision_source
```

---

## 3. The phase 3 migration: what was applied and what is on disk

### 3.1 The applied file was recovered byte exactly

The phase 3 migration was created with `prisma migrate dev --create-only` on
2026-10-30 at 13:34:30, edited twice (13:35:30 and 13:35:50) and applied at
13:36:24 — the `started_at` of the migration in `_prisma_migrations` is
`2026-10-30 13:36:24.971193+05:30`.

The file was edited **after** it had been applied. The content that was on disk
at the moment of the application was reconstructed from the session history of
that run (the read of the generated file plus the two edits that followed it).

The reconstruction has the length 5830 bytes and the SHA-256

```
8031ecf36db288041efa2c4d741c12e74e402ba0ceda9b85111f7f745182bac8
```

which is **exactly** the checksum that the database stores for
`20261030080432_phase3_attendance_operations`. The reconstruction is therefore
not a guess: it is the applied file, proven by the checksum that Prisma itself
computed when it applied the migration.

### 3.2 The two files differ only in the treatment of the historical data

Both files were split into statements. The comparison ignores comments and
respects the dollar quoted blocks.

| | applied file | file on disk |
| --- | --- | --- |
| DDL statements | 30 | 30 — **identical, same text, same order, byte for byte** |
| data statements | 1 | 3 — **the statement of the applied file is absent, it is not a shorter version of it** |
| position of the data statements | position 7 | positions 5, 6 and 9 |
| length | 5830 bytes | 8809 bytes |
| SHA-256 | `8031ecf3…82bac8` | `9b9c520d…5915ce` |

The 30 DDL statements are:

| category | number |
| --- | --- |
| `CREATE TYPE` | 4 |
| `ALTER TABLE … DROP CONSTRAINT` | 1 |
| `ALTER TABLE … ADD COLUMN` | 2 |
| `ALTER TABLE … ALTER COLUMN` | 3 |
| `CREATE TABLE` | 3 |
| `CREATE UNIQUE INDEX` | 1 |
| `CREATE INDEX` | 10 |
| `ALTER TABLE … ADD CONSTRAINT` | 6 |
| **total** | **30** |

Every one of them is byte identical, including its internal whitespace, and
they stand in the same relative order in the two files. The earlier list of
the categories of this document said "the two `ALTER TABLE` on `Attendance`"
and "the eight `CREATE INDEX`"; that list summed to 24 and not to 30. The
three `ALTER TABLE … ALTER COLUMN` statements on `Attendance` were not
counted at all, and there are eleven index statements and not eight.

The data section is the difference. It is not that the file on disk has more
statements: **the statement of the applied file is gone.** The file on disk
carries a guard, a canonicalisation and a metadata block, and none of the
three is a variant of the `UPDATE` that was applied.

**Applied file — one statement, at the position 7** (between the `ADD COLUMN`
at the position 6 and the first `ALTER COLUMN` at the position 7 of the DDL):

```sql
-- A value outside the controlled set is stored as an absence instead of
-- breaking the migration. The unit data only uses the listed values.
UPDATE "Attendance" SET "status" = 'ABSENT' WHERE "status" NOT IN ('PRESENT', 'ABSENT', 'ON_DUTY', 'LEAVE', 'LATE', 'EXCUSED');
```

**File on disk — three statements, at the positions 5, 6 and 9.** The `UPDATE`
of the applied file is **not** among them: the file on disk holds no
statement that rewrites a status to `ABSENT`.

```sql
-- 1. the guard: the migration stops and names the values it cannot classify
DO $$ … IF unsupported_values IS NOT NULL THEN RAISE EXCEPTION … END IF; END $$;

-- 2. the canonical spelling: the meaning is kept, the spelling is normalised
UPDATE "Attendance"
   SET "status" = upper(regexp_replace(btrim("status"), '\s+', '_', 'g'))
 WHERE "status" <> upper(regexp_replace(btrim("status"), '\s+', '_', 'g'));

-- 3. the metadata of the historical rows
DO $$ … SET "method" = 'LEGACY' WHERE "method" = 'MANUAL' AND "markedAt" = migration_timestamp;
        UPDATE "Attendance" SET "markedAt" = "createdAt" WHERE "markedAt" = migration_timestamp; … END $$;
```

The three statements of the file on disk do not stand where the applied
statement stood. The guard and the canonicalisation run at the positions 5
and 6, that is **before** the `DROP CONSTRAINT` and **before** the
`ADD COLUMN`, and the metadata block runs at the position 9, that is after
the `ADD COLUMN` and before the first `ALTER COLUMN`. The order is correct:
the guard and the canonicalisation have to run while `"status"` is still a
text column, and the metadata block has to run after the columns `markedAt`
and `method` exist. The transaction time is the same in all three places, so
the metadata block finds exactly the rows of the earlier application.

### 3.3 The difference on the data, and the change of the statement order

| Historical value of `Attendance.status` | Applied file | File on disk | Difference |
| --- | --- | --- | --- |
| `PRESENT`, `ABSENT`, `ON_DUTY`, `LEAVE`, `LATE`, `EXCUSED` | kept | kept | none |
| `present`, `On Duty`, `on  duty`, … | **rewritten to `ABSENT`** | normalised to the canonical spelling, the meaning is kept | **the applied file destroyed the meaning of the row** |
| any other value | **rewritten to `ABSENT`**, silently | the migration stops, the value is named, nothing is changed | **the applied file destroyed the row** |
| `method` of a historical row | `MANUAL` (a claim that is not true) | `LEGACY` | the trail is honest only with the file on disk |
| `markedAt` of a historical row | the time of the migration | the creation time of the row | the reports show the real time only with the file on disk |

The table above describes the difference on the **data**. It is the only
difference in the behaviour of the rows. The **executable statement order**
changed as well: the data section moved from the position 7 to the positions
5, 6 and 9 (section 3.2). Both files are applied in one transaction, so the
order decides when the guard runs and when the rows are rewritten, and it
decides whether a historical row that carries an unexpected status stops the
migration before or after the columns were touched. The order of the file on
disk is the safe one: the guard runs first and stops the migration before a
single column of the table is changed.

The applied file therefore contains the behaviour that phase 3.5.3 has already
removed. The change is a **safety improvement**: the old file guessed, the new
file stops and asks.

---

## 4. Effect on a database that was migrated with the applied file

This is the state of the local development database and, most likely, of every
database that was migrated on 2026-10-30.

1. **The schema is already the schema of the file on disk.** All 30 DDL
   statements are identical, so the schema does not need to change.
2. **The file cannot be applied again.** The first statement
   (`CREATE TYPE "AttendanceSessionStatus"`) fails with
   *type already exists*, the second and third fail the same way. Prisma stops
   the chain there. Nothing is changed, because every statement of the file is
   transactional.
3. **The data statements of the file on disk are no longer reachable.** The
   canonicalisation would also fail on the already converted column, because
   the column is the enum `AttendanceStatus` and the statement assigns a text
   expression without a cast.
4. **The result is the checksum mismatch.** Prisma compares the checksum of
   every applied migration with the file on disk before it applies anything.
   The comparison of the phase 3 file fails, and the chain is refused.

So an existing database needs **no schema change** for the phase 3 migration.
It needs the bookkeeping to agree with the file on disk, and that is the
checksum reconciliation that is not approved.

## 5. Effect on a fresh database

A fresh database receives the current chain:

1. `20261026000000` … `20261030210643` are applied unchanged; their checksums
   match the applied ones, so their behaviour is identical everywhere.
2. `20261030080432_phase3_attendance_operations` applies **cleanly** and
   produces the **same schema** as the applied file. The difference is only in
   the historical data:
   * a status with a non canonical spelling keeps its meaning and is
     normalised;
   * a status outside the controlled set **stops the migration** with the
     names of the values, so an administrator classifies them first;
   * the historical rows keep their creation time as the marking time and are
     marked as `LEGACY` instead of `MANUAL`.
3. `20261101090000_account_deactivation` applies cleanly: it adds three
   columns, one index, one foreign key and changes the foreign key of the
   profile to `RESTRICT`.
4. `20261105000000_approval_decision_source` applies cleanly: it adds the
   enum, the column with the default `NONE` and the two backfills
   (`ADMINISTRATOR` for the accounts with an administrator, `AUTOMATIC` for the
   accounts that the roster approved).

A fresh database therefore ends with a **better** history than the database of
2026-10-30: the historical statuses are classified instead of guessed, and the
historical rows are not labelled with a method that was never used.

## 6. The deactivation migration: the schema is there, the row is missing

The local development database carries every object of
`20261101090000_account_deactivation`:

| Object of the migration | Present in the database |
| --- | --- |
| `User.deactivatedAt`, `User.deactivatedById`, `User.deactivationReason` | yes |
| `User_deactivatedAt_idx` | yes |
| `User_deactivatedById_fkey` (`ON DELETE SET NULL`) | yes |
| `CadetProfile_userId_fkey` changed to `ON DELETE RESTRICT` | yes |

but the table `_prisma_migrations` has **no row** for it. The schema of the
migration is applied, the bookkeeping is not.

Consequences:

* `prisma migrate deploy` would try to run the migration again and would fail
  on the first `ADD COLUMN` (*column "deactivatedAt" of relation "User" already
  exists*). The chain stops there and the migrations behind it — including
  `20261105000000_approval_decision_source` — are not applied.
* `prisma migrate status` reports the migration as pending, which is exactly
  what the output in section 2 shows.

The remedy is the Prisma command `migrate resolve --applied
20261101090000_account_deactivation`: it records the migration as applied
without executing it, because its effects are already in the database. **This
is a database operation and is therefore not part of stage 3.** It is the
first step of the plan of section 9.

The same check has to be run against every other database of the unit,
especially the production database, before any migration is applied there. The
operator has to run the read-only query of section 12 and compare the result
with the table of section 2.

## 7. The M1 migration: created, not applied

`20261105000000_approval_decision_source` does not exist in any database that
was checked. Its file is additive and data preserving:

* the enum `ApprovalDecisionSource` is created with the three values
  `NONE`, `AUTOMATIC`, `ADMINISTRATOR`;
* the column is added as `NOT NULL` with the default `NONE`, so no row can be
  null and no row is rewritten;
* the two backfills only set the column of the rows that carry a decision:
  `ADMINISTRATOR` where `approvedById` is set, `AUTOMATIC` where the account
  is approved, was never decided by an administrator and is linked to a roster
  row. Every other row keeps `NONE`.

The application was written for both windows: before the migration it reads
the source of the decision from `approvedById` alone, after the migration it
reads the column. The behaviour is the same in both windows, and the test
suite asserts the contract of the window it runs in.

---

## 8. The checksum reconciliation

The checksum of the phase 3 migration in the database describes a file that
does not exist any more. The file that exists now describes a **safer**
migration, but it is not the file that was applied.

| Option | What it does | What it costs | State |
| --- | --- | --- | --- |
| `migrate resolve --rolled-back 20261030080432_phase3_attendance_operations` | tells Prisma that the migration was rolled back, so it would be applied again | **wrong**: the schema is already there, the migration would fail on `CREATE TYPE` | rejected |
| `migrate resolve --applied 20261101090000_account_deactivation` | records the deactivation migration without running it | none; its effects are already in the database | **proposed for stage 5** |
| a direct `UPDATE` of the checksum in `_prisma_migrations` | makes the bookkeeping agree with the file on disk | the database is edited outside of Prisma, without a transaction and without a record of the change | **not approved**; it is the only mechanism that Prisma does not offer |
| leave the checksum as it is | the chain stays refused for `migrate deploy` | the phase 3.5.3 and M1 migrations can never be applied by Prisma | **the permanent limitation** until the institution decides |

The last line of the table is the honest state of the system: as long as the
checksum reconciliation is not approved, `prisma migrate deploy` cannot be
used against a database that carries the phase 3 migration. The application
itself is not affected: it runs against the schema of the database, and the
schema is correct.

---

## 9. The plan for stage 5 (not authorised, not executed)

The analysis above is the prerequisite of the plan. The plan itself needs an
explicit authorisation.

1. **A backup.** A new dump of the database, because the existing backup
   predates the deactivation migration and is therefore not a valid rollback
   point.
2. **The read-only inventory** of every database of the unit (the query of
   section 12) and the comparison of the result with the table of section 2.
   The production database may have a different history than the development
   database.
3. **`migrate resolve --applied 20261101090000_account_deactivation`** on every
   database whose schema already carries the deactivation. This is the only
   write that is needed for the bookkeeping of the phase 3.5.3.
4. **The decision about the checksum of the phase 3 migration.** Either the
   institution authorises the single row update in `_prisma_migrations`, or it
   accepts that the chain stays refused for `migrate deploy`. The update
   changes the bookkeeping only; the schema is already correct and the
   behaviour of the application does not change.
5. **`migrate deploy`** for `20261105000000_approval_decision_source`, or
   `migrate resolve --applied` for it if the column is added by hand first.
   The file is additive and data preserving, so the deployment is safe once
   the bookkeeping is correct.
6. **The verification** after the deployment: the column exists, the backfills
   produced the expected sources, the application runs, and the whole test
   suite passes against the migrated database.

## 10. The accounting of the PostgreSQL coverage

The suite of the phase 3.6 has 270 tests. They are not all database tests: a
test that reads a file, that uses a test double or that calls a function
without a database is a unit test, however important it is. The honest split
of the phase 3.6:

| Suite | tests | PostgreSQL | development server only | unit / fake / static |
| --- | --- | --- | --- | --- |
| approval-integration | 7 | 7 | 0 | 0 |
| roster-integration | 6 | 6 | 0 | 0 |
| registration-integration | 6 | 6 | 0 | 0 |
| audit-integration | 6 | 6 | 0 | 0 |
| photo-integration | 10 | 7 | 0 | 3 |
| attendance-integration | 6 | 6 | 0 | 0 |
| **new suites of the phase 3.6** | **41** | **38** | **0** | **3** |
| access-control | 19 | 19 | 0 | 0 |
| profile-api | 12 | 12 | 0 | 0 |
| attendance-api | 12 | 12 | 0 | 0 |
| deactivation | 10 | 9 | 1 | 0 |
| user-exposure | 7 | 3 | 0 | 4 |
| migration-attendance-status | 10 | 5 | 0 | 5 |
| **existing suites with a database** | **70** | **60** | **1** | **9** |
| the eleven suites without a database (`prisma-guard`, `prisma-target`, `eligibility`, `account-service`, `account-deactivation`, `profile-fields`, `profile-photo`, `profile-service`, `module-syntax`, `attendance-rules`, `attendance-service`) | 159 | 0 | 0 | 159 |
| **total of the phase 3.6** | **270** | **98** | **1** | **171** |

The 99 tests of the phase 3.6 that need the local environment are therefore
**38 new tests of the six new suites and 61 tests of the suites that existed
before** (60 that write against PostgreSQL and one that only asks the
development server for its answer). The earlier phrasing "41 new and 58
existing" was wrong on both numbers: three of the tests of
`photo-integration` never open a database, and the list of the existing
database tests sums to 61 and not to 58.

One test of `deactivation` ("the server has to be reachable for the API
tests") asks the development server for its answer and writes no statement of
its own. It is counted with the environment, not with the database.

### 10.1 What the phase 3.7 adds

| Suite | tests | PostgreSQL | development server only | unit / fake / static |
| --- | --- | --- | --- | --- |
| audit-hash-key | 8 | 0 | 0 | 8 |
| audit-rollback-integration | 3 | 3 | 0 | 0 |
| **total** | **11** | **3** | **0** | **8** |

The totals after the phase 3.7 are therefore **281 tests**, of which **102
need the local environment** (41 of the new suites and 61 of the existing
ones) and **179 are unit, fake or static tests**. The suite `audit-hash-key`
never opens a database: it proves the policy of the key with the functions of
the redaction, with a test double for the table of the trail and with two
separate processes.

### 10.2 No test skips because the environment is broken

The helper `scripts/helpers/db-suite.mjs` has exactly one skip: the
configured `DATABASE_URL` is not a local development database. Everything
else is a failure.

| Condition | Behaviour | Reference |
| --- | --- | --- |
| the target is not a local development database | skip | `scripts/helpers/db-suite.mjs:79-86` |
| the session secret is missing | failure | `scripts/helpers/db-suite.mjs:108-114` |
| the development server does not answer | failure | `scripts/helpers/db-suite.mjs:122-137` |
| the database does not answer | failure | `scripts/helpers/db-suite.mjs:145-155` |
| a column of a migration is missing | failure | `scripts/helpers/db-suite.mjs:170-185` |

A suite that skips in a broken environment reports a green result while it
proved nothing, so the rule of the helper is that the environment of the unit
has to work.

## 11. The key of the email references of the audit trail

The audit trail stores the address of a cadet as a keyed HMAC
(`hmac:<32 hex>`), never as a value. The key decides whether two processes
can correlate the same address, so the phase 3.7 gave the key a rule.

### 11.1 What the review of the phase 3.6 found

Before the phase 3.7 the key was resolved by `auditHashKey()` in
`src/lib/audit-redaction.mjs`: the first of `AUDIT_HASH_KEY`,
`ATTENDANCE_CODE_SECRET`, `AUTH_SECRET` and `NEXTAUTH_SECRET` that was set
and long enough. If none of them was set, the module generated a **random key
of the process** and wrote a warning.

The finding was that this fallback was **reachable in production**: a
deployment that had none of the four secrets wrote the references of the
addresses with a random key, so the same address had a different reference in
every instance of the function. The warning was the only signal, and a
warning in the log of a function is not a failure. The fallback is not a leak
of the address — the address is still never stored — but it breaks the
property the trail relies on: the same address has to have the same
reference.

### 11.2 The rule now

| Environment | The key |
| --- | --- |
| production | the dedicated `AUDIT_HASH_KEY`, at least 16 characters, and not the value of another secret of the deployment |
| development | `AUDIT_HASH_KEY`, or one of the other secrets of the machine, or the random key of the process with a warning |

In production a missing key, a key that is too short and a key that repeats
`AUTH_SECRET`, `NEXTAUTH_SECRET` or `ATTENDANCE_CODE_SECRET` are refused.
The refusal happens **before** the event is written
(`src/lib/audit-writer.mjs`), so no event with an unusable reference reaches
the table. Because the event is written in the same transaction as the
business change, the refusal rolls the business transaction back with it.

The mode is decided by the environment of the **process**
(`process.env.NODE_ENV`, `process.env.VERCEL_ENV`), never by the environment
that a caller passes to a function, so the rule cannot be bypassed by handing
a different environment to the redaction.

### 11.3 What the tests prove

| Claim | Test |
| --- | --- |
| production refuses the write without the key | `scripts/audit-hash-key.test.mjs` |
| production refuses a key that is too short | `scripts/audit-hash-key.test.mjs` |
| production never substitutes another secret | `scripts/audit-hash-key.test.mjs` |
| production refuses a key that repeats another secret | `scripts/audit-hash-key.test.mjs` |
| the reference is the same in two separate processes with a key | `scripts/audit-hash-key.test.mjs` |
| the reference is different in two separate processes without a key | `scripts/audit-hash-key.test.mjs` |
| the business transaction is rolled back | `scripts/audit-rollback-integration.test.mjs` |

The test of the audit integration
(`scripts/audit-integration.test.mjs:168-202`) proves the stability of the
reference **inside one process** only: it compares the stored value with a
second call of the same process, and the test process has no stable key
configured. The cross-process proof is the new test of the policy of the key.

### 11.4 The consequence for the deployment

A production deployment has to configure `AUDIT_HASH_KEY` with a dedicated
value of at least 16 characters (for example `openssl rand -hex 32`). Until
it does, **every** write of the audit trail is refused and every change of
the unit that is written with its audit event is rolled back. The secret is
not configured by this stage; the deployment configuration is not touched.

---

## 12. The evidence and the commands that produced it

Every command of this analysis was read-only.

```sql
-- the applied state
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at
  FROM _prisma_migrations ORDER BY started_at;

-- the schema of the deactivation migration
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conname IN ('CadetProfile_userId_fkey', 'User_deactivatedById_fkey');

SELECT indexname FROM pg_indexes WHERE tablename = 'User';

\d "User"
```

```bash
# the files on disk
for d in prisma/migrations/*/; do shasum -a 256 "$d/migration.sql"; done

# the verdict of Prisma itself (read-only command of the guard)
node scripts/prisma-guard.mjs migrate status
```

Nothing in this analysis applied a migration, changed a checksum, created a
database or touched the production database.
