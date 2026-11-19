# Migration safety, account lifecycle and legacy compatibility

*Phase 3.5.3 · remediation of the migration and the backward compatibility findings*

This document is the reference for the changes of the phase 3.5.3. It records
what the historical data looks like, how the migration treats it, how the
account lifecycle works and what still needs a decision of the institution.

---

## 1. The historical attendance status

### 1.1 What the old application could write

The attendance API of the earlier phases wrote the status of a mark without any
validation:

```ts
// src/app/api/admin/attendance/route.ts, before phase 3
attendances: {
  create: marks.map((m: { userId: string; status: string }) => ({
    userId: m.userId,
    status: m.status || "PRESENT",
  })),
},
```

The old admin and officer screens offered four values, and the old API stored
whatever a caller sent. The status was therefore free text in the database.

### 1.2 The compatibility table

| Value | Source | In the phase 3 enum | Treatment of the migration |
| --- | --- | --- | --- |
| `PRESENT` | the old admin and officer screens, the default of the old API | yes | kept unchanged |
| `ABSENT` | the old admin and officer screens | yes | kept unchanged |
| `ON_DUTY` | the old admin and officer screens | yes | kept unchanged |
| `LEAVE` | the old admin and officer screens | yes | kept unchanged |
| `LATE` | added by phase 3 | yes | kept unchanged |
| `EXCUSED` | added by phase 3 | yes | kept unchanged |
| `present`, `Present`, `on duty`, `On Duty`, … | a direct call of the old API with a different spelling | after normalisation | normalised to the canonical spelling, the meaning is kept |
| anything else | a direct call of the old API with an unknown value | **no** | **the migration stops and names the value** |

The four values of the old screens are all members of the new enum, so no
historical status needs an explicit mapping and the enum does not need a
member for a legacy value.

### 1.3 What the migration does now

The migration `20261030080432_phase3_attendance_operations` runs a guard
**before** it changes the column:

```sql
DO $$
DECLARE
    unsupported_values TEXT[];
BEGIN
    SELECT array_agg(DISTINCT "status" ORDER BY "status")
      INTO unsupported_values
      FROM "Attendance"
     WHERE upper(regexp_replace(btrim("status"), '\s+', '_', 'g'))
       NOT IN ('PRESENT', 'ABSENT', 'ON_DUTY', 'LEAVE', 'LATE', 'EXCUSED');

    IF unsupported_values IS NOT NULL THEN
        RAISE EXCEPTION
            'The Attendance table contains % status value(s) outside the controlled set: %. ...',
            array_length(unsupported_values, 1),
            array_to_string(unsupported_values, ', ');
    END IF;
END
$$;
```

A value that only differs in its case or in the spacing of its words keeps its
meaning and is written in the canonical spelling. Every other value aborts the
migration with the list of the values that have to be classified.

**No historical row is ever rewritten to `ABSENT` and no row is dropped.** The
previous version of the migration contained

```sql
UPDATE "Attendance" SET "status" = 'ABSENT'
 WHERE "status" NOT IN ('PRESENT', 'ABSENT', 'ON_DUTY', 'LEAVE', 'LATE', 'EXCUSED');
```

which silently destroyed the meaning of an unknown value. That statement is
gone.

The behaviour is covered by `scripts/migration-attendance-status.test.mjs`. The
test runs the statements of the migration against a real PostgreSQL in a schema
of its own and rolls the transaction back every time, so the database of the
developer is never changed.

### 1.4 The metadata of the historical rows

`markedAt` and `method` did not exist before phase 3. Every historical row
received the default of both columns.

| Column | Before the phase 3 | Now |
| --- | --- | --- |
| `markedAt` | did not exist | `markedAt = createdAt` for every historical row |
| `method` | did not exist | `LEGACY` for every historical row |

`createdAt` is a reliable source: the old table kept it with
`DEFAULT CURRENT_TIMESTAMP`, and it is the moment the mark was written. The
default of `markedAt` is the start of the migration transaction, so it is the
exact value that identifies the historical rows and the backfill cannot touch
a row that was written later.

The original method cannot be reconstructed. The old API never stored it.
Claiming that an administrator marked the row by hand would be a false
statement in the attendance reports, so the historical rows carry `LEGACY`
instead. `MANUAL`, `QR` and `MANUAL_CODE` are the methods of the phase 3.

---

## 2. The legacy activity type

The activity type of a session was free text before phase 3 as well. The old
admin screen offered five values and the controlled vocabulary of phase 3 uses
seven uppercase names.

| Legacy spelling | Canonical type | Reason |
| --- | --- | --- |
| `Parade` | `PARADE` | the value is the name of the canonical type |
| `Camp` | `CAMP` | the value is the name of the canonical type |
| `Drill` | `DRILL` | the value is the name of the canonical type |
| `Physical Training` | `PHYSICAL_TRAINING` | the value is the name of the canonical type |
| `Weapon Training` | `TRAINING` | a weapon training is a training activity. It is neither a physical training nor a drill practice. The same rule already mapped `Training Session` to `TRAINING`. |
| `Weapon Firing` | **not mapped** | the old screen does not say whether it is a drill or a training |
| `Social Service` | **not mapped** | the old screen does not say whether it is an event or another category |
| `Lecture` | **not mapped** | the old screen does not say whether it is a training or another category |

The three unmapped values are listed in `UNMAPPED_LEGACY_ACTIVITY_TYPES` of
`src/lib/attendance-rules.mjs`. **They need a decision of the unit.** Until
then they are handled as follows:

* they are never counted as another activity type;
* they are never silently excluded from a calculation. A session whose type
  cannot be classified stays in the denominator and is reported;
* the calculation reports them in `unclassifiedSessions` and in
  `unclassifiedActivityTypes`, and the explanation of the result names them;
* a filter on the canonical type matches the legacy spellings of that type, so
  the sessions of the earlier phases do not disappear from the report.

An administrator that writes such a spelling into the policy itself gets
exactly those sessions. That is an explicit decision of the administrator and
the application follows it without guessing.

`normalizeActivityType` in `src/lib/attendance-rules.mjs` is the single
canonical function. The calculator, the report filter, the report totals and
the policy write all use it.

---

## 3. The account lifecycle

### 3.1 The previous behaviour

`DELETE /api/admin/cadets` called `prisma.user.delete()`. With the foreign
keys of phase 3 that failed with a foreign key error for every cadet with an
attendance or a leave request, and the admin interface showed nothing at all.
Without those rows the delete succeeded and removed the profile of the cadet
with it.

### 3.2 The new behaviour

An operational account is **deactivated**, not deleted.

| Column | Meaning |
| --- | --- |
| `deactivatedAt` | the moment of the deactivation |
| `deactivatedById` | the administrator who performed it |
| `deactivationReason` | the written reason of the administrator |

The deactivation and its audit event are written in one transaction. The
approval state of the account is **not** changed: the approval lifecycle and
the deactivation are two separate facts.

| Rule | Where it is enforced |
| --- | --- |
| a deactivated account cannot sign in | `resolveGoogleAccount` in `src/lib/account-service.mjs` |
| a deactivated account gets `403` on every protected API | `authorize` in `src/lib/guard.ts` |
| a deactivated account is sent to `/pending` on every protected page | `isApprovedAccount` in `src/lib/guard.ts`, used by the five protected layouts and by `/profile` |
| a deactivated account cannot check in | `recordCheckIn` in `src/lib/attendance-service.mjs` |
| a deactivated cadet is not marked, not reported and not listed as an active cadet | the eligible cadet queries of the attendance service, the reports and the officer dashboard |
| a deactivated account cannot be approved | `setApprovalStatus` in `src/lib/account-service.mjs` |
| the last active administrator cannot be deactivated | `deactivateAccount` in `src/lib/account-service.mjs` |
| an administrator cannot deactivate their own account | `deactivateAccount` in `src/lib/account-service.mjs` |

The foreign key of `CadetProfile` changed from `CASCADE` to `RESTRICT`, so the
profile of a cadet cannot be removed by a delete of the account either.

### 3.3 The data that stays

A deactivation keeps everything that belongs to the cadet:

* the account row, with the name, the email address, the PRN and the other
  identifiers;
* the attendance rows, with their original owner;
* the leave requests, with their original owner;
* the profile and the photo;
* the audit history, including the event of the deactivation.

**The identifiers are not scrubbed.** The name, the email address and the PRN
stay in the database, because the historical attendance has to stay attached to
the person who earned it. The unit has to decide separately, and with the
university, whether the personal data of a cadet who left the unit may be
removed and after which period. That decision is not taken by the application.
Until it is taken, the data stays.

### 3.4 The migration of the account lifecycle

`20261101090000_account_deactivation` adds the three columns, the index and
the foreign key of the administrator, and it changes the foreign key of the
profile.

---

## 4. The migration files of the repository

| Path | What it is |
| --- | --- |
| `prisma/migrations/` | the migrations that are applied, in order |
| `prisma/baseline-candidate/` | **a historical snapshot, not the current schema** |

`prisma/baseline-candidate/` holds the SQL of the tables that existed before
the recorded baseline migration. It is a snapshot for reference and for a
one-off comparison. It is **not** the schema of the application: it has no
approval state, no roster, no profile, no attendance and no leave tables, and
its `User` table has a different shape. It is never applied by
`prisma migrate deploy`, because it lives outside `prisma/migrations/`. The
directory is kept unchanged and it must not be edited to match the current
schema.

### 4.1 The unguarded `DROP CONSTRAINT`

The phase 3 migration contains

```sql
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_userId_fkey";
```

without `IF EXISTS`. That is deliberate. The constraint is created by
`20261026000000_core_tables`, so it exists in every database that was built
through the recorded chain. A migration that skips the drop because the
constraint is missing would then add a **second** foreign key with the same
name while the old `ON DELETE CASCADE` constraint could still be there under a
different name. That is exactly the inconsistent schema the migration has to
prevent, so the statement fails loudly instead of hiding the problem.

---

## 5. The local migration history after the change

The migration `20261030080432_phase3_attendance_operations` was already applied
to the local development database `ncc_dev` when it was changed. Its checksum
in `_prisma_migrations` no longer matches the file.

| Migration | Checksum in `_prisma_migrations` |
| --- | --- |
| `20261026000000_core_tables` | `fe3db57a950359373eb480b8d2bea26651f017bc74edd0da143d85b9912d12e5` |
| `20261027000000_init_baseline` | `64797f0c8814a02569468c7c15bca3fb326cc71758a38939713898bda0ddc871` |
| `20261029000000_account_approval_and_roster` | `291121313df3caee25e3ec2e52188d94b2123b454f22dd40dc6ad099f4c92338` |
| `20261030000000_cadet_profile_completion` | `7453b4c5056eb38c914ebe814138ec32c91c878cf7aa6088c0fead849c7920d9` |
| `20261030080432_phase3_attendance_operations` | `8031ecf36db288041efa2c4d741c12e74e402ba0ceda9b85111f7f745182bac8` (**stale**) |
| `20261030210643_phase3_manual_fallback_code` | `98ded183ea7b326f697a000eba5fd471b7a0d93bd30493e5199e2e1f02453d6d` |

The checksum of the file before the change was
`8031ecf36db288041efa2c4d741c12e74e402ba0ceda9b85111f7f745182bac8`. The
checksum of the file after the change is
`9b9c520d85b45ab1f98bec2c0aad803e47860e0c65fa56bd6a28ad49ce5915ce`.

**What Prisma does with this.** The schema engine compares the checksum of
every applied migration with the checksum of the file on disk. A difference
makes it stop before it applies anything and report

```text
`20261030080432_phase3_attendance_operations` was modified after it was applied.
```

The message and the abort were verified in the schema engine that ships with
this repository
(`node_modules/@prisma/engines/schema-engine-darwin-arm64`). The abort was
**not** executed against `ncc_dev`, because the new deactivation migration was
applied to `ncc_dev` by hand (see 5.2) and a run of `migrate deploy` would
have tried to apply it a second time and left a **failed** migration row
behind. Clearing such a row needs `prisma migrate resolve`, which is out of
scope.

**The error code P3009 is not the one of this problem.** `P3009` is Prisma's
code for *failed migrations found in the target database*. The modified
migration is a different condition and it has its own message. A report that
says "the deploy fails with P3009" is wrong.

### 5.1 The safe reconciliation

**The reconciliation was not carried out.** The rules of the phase 3.5.3 say
that the checksum conflict is documented and that the reconciliation stops
before it is attempted. The plan for a developer or an operator is:

1. **Back up the database first.**
   ```bash
   pg_dump --dbname="$DATABASE_URL" --format=custom --file="ncc-backup-$(date +%Y%m%d-%H%M%S).dump"
   ```
2. **Never replay either migration.** The phase 3 migration and the account
   deactivation migration **cannot be applied a second time**. This is a
   property of the SQL, not a matter of taste. See §5.3.
   * The phase 3 migration opens with `CREATE TYPE "AttendanceSessionStatus"`,
     `CREATE TYPE "AttendanceStatus"`, `CREATE TYPE "LeaveStatus"` and
     `CREATE TYPE "LeaveType"` without `IF NOT EXISTS`, then creates three
     tables, seventeen indexes and two foreign keys the same way, and it drops
     `Attendance_userId_fkey`, which it has already dropped once.
   * Its status guard is **not type safe**. The guard calls
     `btrim("status")` on the `Attendance.status` column. After the migration
     has run once, that column is the enum `AttendanceStatus`, and PostgreSQL
     has no `btrim(enum)` function. A re-run therefore aborts with

     ```text
     ERROR:  function btrim("AttendanceStatus") does not exist
     ```

     This was verified against the local database inside a transaction that was
     rolled back afterwards.
   * The account deactivation migration opens with
     `ALTER TABLE "User" ADD COLUMN "deactivatedAt"` without `IF NOT EXISTS`,
     creates `User_deactivatedAt_idx` without `IF NOT EXISTS`, adds
     `User_deactivatedById_fkey` without a guard, drops
     `CadetProfile_userId_fkey` without `IF EXISTS` and adds it back. Every one
     of those five statements fails on a database that already has them.

   **Consequence:** a `prisma migrate deploy` against `ncc_dev` must never be
   used to "repair" the history. It would fail on the first statement of the
   migration it tries to re-apply and leave a **failed** migration row behind.
3. **Never edit `_prisma_migrations` by hand.** `prisma migrate resolve` is
   the only sanctioned way to change the history, and its exact behaviour is
   recorded in §5.4.
4. **A fresh database is the clean way to verify the chain.** A disposable
   database proves that the whole chain applies from zero. The result of such
   a run is the only proof that the edited migration works on an empty
   database. **A fresh database is not enough on its own** — see §5.5.

### 5.2 The state of the local database

The migration `20261101090000_account_deactivation` was applied to the local
development database `ncc_dev` **by hand**, with the statements of the file
and inside a single transaction:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f prisma/migrations/20261101090000_account_deactivation/migration.sql
```

The approval of the owner of the database was asked for and given before this
was done. A backup of `ncc_dev` was taken first.

The state that this leaves behind is deliberate and it is known:

| What | State |
| --- | --- |
| the three columns, the index and the two foreign keys | **applied** in `ncc_dev` |
| `_prisma_migrations` | **not** changed, it still holds the six rows of the earlier chain |
| `prisma migrate status` | reports `20261101090000_account_deactivation` as **pending** |
| the checksum of the edited phase 3 migration | still **stale** |

The application does not care: Prisma reads the columns of the database and
not the history table. The history table only matters for the next
`migrate deploy`, and that deploy needs the reconciliation of 5.1 anyway.

**The production database was never touched by this change.**

### 5.3 The two migrations that must never be replayed

| Migration | Why it cannot be applied a second time |
| --- | --- |
| `20261030080432_phase3_attendance_operations` | four `CREATE TYPE` without `IF NOT EXISTS`, three `CREATE TABLE`, seventeen `CREATE INDEX`, two `ALTER TABLE … ADD COLUMN`, one `ADD CONSTRAINT`, one unguarded `DROP CONSTRAINT`, and a status guard that calls `btrim("status")` on a column that is already the enum `AttendanceStatus` after the first run. PostgreSQL has no `btrim(enum)` function, so the guard aborts with `function btrim("AttendanceStatus") does not exist`. |
| `20261101090000_account_deactivation` | five statements without any guard: `ADD COLUMN` (×3 columns in one statement), `CREATE INDEX`, `ADD CONSTRAINT`, `DROP CONSTRAINT` and `ADD CONSTRAINT` again. Every one of them fails on a database that already has the objects. |

The other five migrations of the chain are in three different states:

| Migration | Replayable? |
| --- | --- |
| `20261026000000_core_tables` | **yes** — every table and index uses `IF NOT EXISTS` and every foreign key is wrapped in a `DO $$ … EXCEPTION WHEN duplicate_object THEN NULL` block |
| `20261030000000_cadet_profile_completion` | **yes** — `DROP NOT NULL` is repeatable and the one `ADD COLUMN` uses `IF NOT EXISTS` |
| `20261027000000_init_baseline` | **no** — `CREATE TYPE`, three `CREATE TABLE`, five `CREATE INDEX` and the `User.role` text-to-enum conversion have no guards |
| `20261029000000_account_approval_and_roster` | **no** — `CREATE TYPE`, `CREATE TABLE`, six `ADD COLUMN` and three `CREATE TRIGGER` (the trigger functions use `CREATE OR REPLACE`, the triggers do not) have no guards |
| `20261030210643_phase3_manual_fallback_code` | **no** — `CREATE TABLE`, three `CREATE INDEX` and two `ADD CONSTRAINT` have no guards |

### 5.4 What `prisma migrate resolve` actually does

This is the behaviour of Prisma `6.19.3`, the version that ships with this
repository. It was confirmed against the test suite of Prisma itself
(`packages/migrate/src/__tests__/MigrateResolve.test.ts`, tag `6.19.3`) and
against the error catalogue of the Prisma documentation.

| Command | State of the migration | Result |
| --- | --- | --- |
| `migrate resolve --applied <name>` | no row in `_prisma_migrations` | **succeeds.** The row is added with the checksum of the file, `finished_at` set, `rolled_back_at` null. The SQL of the file is **not** executed. |
| `migrate resolve --applied <name>` | the migration is already recorded as applied | **fails with `P3008`** — *"The migration `{migration_name}` is already recorded as applied in the database."* It does **not** refresh the checksum. |
| `migrate resolve --applied <name>` | the migration is in a **failed** state | succeeds — the failed row is closed. |
| `migrate resolve --applied <name>` | the migration file does not exist | fails with `P3017`. |
| `migrate resolve --rolled-back <name>` | the migration was never applied | **fails with `P3011`** — *"cannot be rolled back because it was never applied to the database."* |
| `migrate resolve --rolled-back <name>` | the migration is applied and **succeeded** | **fails with `P3012`** — *"cannot be rolled back because it is not in a failed state."* |
| `migrate resolve --rolled-back <name>` | the migration is in a **failed** state | succeeds — `rolled_back_at` is set, and the migration becomes eligible for a new deployment. |

**Two consequences for this repository.**

1. `prisma migrate resolve --applied 20261101090000_account_deactivation` is
   the correct and sanctioned way to record the manually applied migration,
   because there is **no row** for it yet. It adds the row without executing
   the SQL.
2. `prisma migrate resolve --applied 20261030080432_phase3_attendance_operations`
   **cannot** be used to refresh the stale checksum: the migration is already
   recorded as applied, so the command stops with `P3008`. The only command
   that can put a migration back into a re-appliable state,
   `--rolled-back`, stops with `P3012` for exactly the same reason.

The checksum of Prisma is the **SHA-256 of the migration file**. This was
verified: the SHA-256 of every unchanged migration file equals the checksum
stored in `_prisma_migrations` exactly. The phase 3 migration directory is
**not tracked by git**, so the content of the file before the phase 3.5.3
edit exists **only** as that checksum and cannot be restored. The file has to
stay as it is, and the recorded checksum has to be brought in line with it.

### 5.5 Two different tests, and both are required

A migration chain that applies cleanly to an empty database is **not** proof
that the historical data survives. The two questions are different and need
two different tests.

| Test | Question it answers | How it is done |
| --- | --- | --- |
| **Fresh database validation** | Does the complete chain apply from an empty database, and does the result match `prisma/schema.prisma`? | A disposable PostgreSQL database that is created for the purpose and dropped afterwards. `ncc_dev` is never used for this. |
| **Historical data validation** | Do the historical attendance rows keep their meaning, their marking time and their method? | A representative set of legacy rows (`PRESENT`, `ABSENT`, `ON_DUTY`, `LEAVE`, the legacy spellings of the activity types, and rows that were marked before the migration) is inserted into a database that carries the old schema, the chain is applied over them, and the result is compared row by row. |

The historical test is the one that protects the data of the unit. The fresh
database test only proves that the SQL is syntactically valid and that the
schema is reproducible. **Neither one replaces the other.**

### 5.6 The backup that exists today is not a rollback point for the reconciliation

| Backup | Taken when | What it contains |
| --- | --- | --- |
| `ncc-dev-pre-deactivation-20261102-024155.dump` (outside the repository) | **before** the account deactivation migration was applied | all 21 tables with their data, `CadetProfile_userId_fkey` with `ON DELETE CASCADE`, and **no** `deactivatedAt`, `deactivatedById` or `deactivationReason` columns |

Restoring that dump would therefore **remove** the deactivation columns and
put the database back before phase 3.5.3. It is a valid rollback point for the
deactivation step alone and **not** for anything that happens afterwards.

**A new backup has to be taken immediately before the reconciliation**, while
`ncc_dev` is in its current state, and it has to be verified with
`pg_restore --list` before it is relied upon.

### 5.7 The schema drift of the `User` model

`prisma/schema.prisma` does not declare the index on `User.deactivatedAt`,
although the database has it and the account deactivation migration creates
it:

```sql
CREATE INDEX "User_deactivatedAt_idx" ON "User"("deactivatedAt");
```

The result is the only difference between the live database and the schema:

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script
# -- DropIndex
# DROP INDEX "User_deactivatedAt_idx";
```

`prisma migrate dev` would read that as *"drop this index"*. The correction is
a **schema-only** change — the declaration `@@index([deactivatedAt])` in the
`User` model — and it needs **no migration**, because the index already exists
in the database and the migration that creates it is already part of the chain.
With the declaration added, `migrate diff` between the database and the schema
returns an empty migration.


