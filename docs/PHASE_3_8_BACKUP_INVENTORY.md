# Phase 3.8 — Gate 1: Backup Inventory and Readiness

**Status: preparation only. No backup was created, moved, deleted or restored.**
**No database was created. No production connection was made.**

> ### Update — Phase 3.8.8 (see §8)
>
> This document was written *before* the fresh backup was taken. Sections 1–7
> are the historical pre-backup finding and are preserved unchanged.
> **§8 records the current state**: the fresh dump
> `ncc_dev-20261107T070354Z.dump` now exists and is **archive-verified**, and a
> restore rehearsal is **reported** but carries no on-disk evidence.
> Read §8 for status; read §1 as the statement of the problem as it stood.
>
> The three states are kept strictly apart and are not interchangeable:
>
> | State | Meaning |
> | --- | --- |
> | **Backup created** | a dump file exists on disk |
> | **Backup archive verified** | checksum matches and `pg_restore --list` succeeded |
> | **Backup restore-tested** | the archive was restored into a disposable database and the result was compared |
>
> A backup in the first state is not a rollback point. Only the third state
> supports a claim that a restore will work.

Every statement below carries one of these labels:

- **[V] Verified** — read from the file system or from the archive itself in this
  session.
- **[H] Historical** — taken from project documentation or a previous report;
  not independently re-verified.
- **[I] Inferred** — a conclusion drawn from the verified facts.
- **[P] Proposed** — a command or procedure to run only after approval.
- **[A] Approval required.**

Repository state at inspection: branch `fix/auth-identity`, HEAD
`96987cfee3a4928cbec7f6d35accd4cd8da5c0fb`. **[V]**

## 1. Executive finding

There is **no usable PostgreSQL backup of `ncc_dev`**. The backup referenced in
the project documentation does not exist on disk, and the only PostgreSQL dump
that does exist is an early snapshot of a different database with a schema that
predates approvals, roster, leave and Phase 3. **[V]**

| Claim in existing docs | Reality |
| --- | --- |
| `ncc-dev-pre-deactivation-20261102-024155.dump` exists "outside the repository" (`README.md` §"The backup that exists today", `docs/MIGRATION_SAFETY.md` §5.6) | **The file does not exist.** `~/ncc-backups/` contains exactly one file, `ncc-public-20261028-023444.dump` **[V]** |
| That dump holds "all 21 tables with their data" | The dump holds **16 tables**, one enum and one migration row **[V]** |
| Its `CadetProfile_userId_fkey` is `ON DELETE CASCADE` and it has no deactivation columns | True of the file that *does* exist, but that file is far older than the description implies **[V]** |
| `backups/ncc-sqlite-backup-20261021-213901.db` is historical | True; it is SQLite, not a PostgreSQL rollback point **[V]** |

Consequences: Gate 1 is **not satisfied**. The first action of Stage 5 must be
the fresh dump in §4, not a reconciliation. **[I]**

## 2. Locations inspected

| Location | Result |
| --- | --- |
| `~/ncc-backups/` | one file: `ncc-public-20261028-023444.dump` **[V]** |
| `<repo>/backups/` | one file: `ncc-sqlite-backup-20261021-213901.db` **[V]** |
| `<repo>/prisma/dev.db` | SQLite legacy database, 2026-10-18 **[V]** |
| `<repo>/prisma/baseline-candidate/full_baseline.sql` | schema candidate SQL, **not a backup** **[V]** |
| Repository for `*.dump`, `*.backup`, `*.sql`, `*.db` (depth 3) | only the files above (plus the baseline SQL) **[V]** |
| Manifests (`*manifest*`) | only `public/manifest.json`, the web-app manifest — unrelated **[V]** |
| Restore-test logs | none found **[V]** |

## 3. Candidate inventory

### 3.1 `ncc-public-20261028-023444.dump`

| Field | Value |
| --- | --- |
| File path | `~/ncc-backups/ncc-public-20261028-023444.dump` |
| File size | 29,144 bytes (~28.5 KiB) |
| Creation time (archive header) | 2026-10-28 02:34:44 IST |
| Modification time (file system) | 2026-10-28 02:34 |
| Permissions | `-rw-------` (0600), directory 0700 |
| Format | PostgreSQL **custom** archive, dump version 1.16-0, gzip |
| Database name (archive header) | **`postgres`** — not `ncc_dev` |
| Dumped from server version | PostgreSQL 17.11 |
| Dumped by client version | pg_dump 18.6 (Homebrew) |
| TOC entries | 72 |
| Tables | 16 (`Announcement`, `Attendance`, `AttendanceSession`, `AuditLog`, `CadetProfile`, `ContactMessage`, `EmailVerificationToken`, `Event`, `EventImage`, `GalleryImage`, `Officer`, `PasswordResetToken`, `SiteStats`, `StudyMaterial`, `User`, `_prisma_migrations`) |
| Table data sections | 16 (all tables have data) |
| Enum types | 1: `UserRole` only |
| Foreign keys | 4, all `ON DELETE CASCADE` |
| Recorded migrations | **1 row**: `20261027000000_init_baseline` (`64797f0c…`), finished |
| SHA-256 | `390ea00899dd8deaf4248e566fd4be9ad56675ec32a73f0937925ec71d1425d9` |
| Contains account-deactivation schema | **No** — `User` has no `deactivatedAt`, `deactivatedById`, `deactivationReason`; `CadetProfile_userId_fkey` is CASCADE |
| Contains approval/M1 schema | **No** — `User` has no `approvalStatus`, `approvedAt`, `approvedById`, `rosterId`, `approvalDecisionSource`; no `ApprovalDecisionSource` type |
| Restore-tested | **No evidence** (no log, no manifest) |
| Suitable as current rollback point | **No** |

The dumped `User` table is exactly:

```
id, name, email, password NOT NULL, role, image, createdAt, updatedAt
```

That is the schema before account approval existed. **[V]**

### 3.2 `ncc-sqlite-backup-20261021-213901.db`

| Field | Value |
| --- | --- |
| File path | `<repo>/backups/ncc-sqlite-backup-20261021-213901.db` |
| File size | 135,168 bytes |
| Modification time | 2026-10-21 21:39 |
| Format | SQLite 3 |
| Database name | n/a (SQLite file) |
| PostgreSQL version | n/a |
| SHA-256 | not computed — not a candidate |
| Contains deactivation schema | No (SQLite legacy) |
| Restore-tested | No |
| Suitable as rollback point | **No** — wrong engine and predates all PostgreSQL migrations |

### 3.3 `prisma/dev.db`

SQLite 3 database last written 2026-10-18 02:08, 135,168 bytes. Historical
artifact. Not a backup. **[V]**

### 3.4 `prisma/baseline-candidate/full_baseline.sql`

A candidate baseline script, not a dump: no data, no `_prisma_migrations` rows,
and explicitly out of bounds for this stage. Do not use as a rollback point. **[V]**

## 4. Fresh backup procedure (not executed)

### 4.1 Target identity (verified now)

| Field | Value |
| --- | --- |
| Database | `ncc_dev` |
| Server | `127.0.0.1:5432` |
| Role | `pallav` |
| Server version | PostgreSQL 18.6 (Homebrew) |
| Size | 10 MB |
| Tables | 21 |
| Enums | 6 (`ApprovalStatus`, `AttendanceSessionStatus`, `AttendanceStatus`, `LeaveStatus`, `LeaveType`, `UserRole`) |
| Indexes | 49 |
| Foreign keys | 14 |
| Triggers | 3 |
| Functions | 2 |
| Migration rows | 6 |
| `User` rows | 1 |
| `Roster` rows | 0 |

Re-read these at the moment of the dump; the numbers will change once M1 is
applied and are only valid as a pre-Stage-5 baseline. **[P]**

### 4.2 Proposed command

Use a password file, not a password in argv. `pg_dump` with a `$DATABASE_URL`
argument puts the password in the process list; the form below does not.

```bash
set -u
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$HOME/ncc-backups/ncc_dev-${STAMP}.dump"

# Credentials come from ~/.pgpass (chmod 600) or PGPASSWORD in the environment.
# Never pass the password on the command line.
pg_dump \
  --host=127.0.0.1 \
  --port=5432 \
  --username=pallav \
  --dbname=ncc_dev \
  --format=custom \
  --compress=9 \
  --no-password \
  --file="$OUT"
STATUS=$?
echo "pg_dump exit=${STATUS}" | tee "${OUT}.status"
[ "$STATUS" -eq 0 ] || { echo "dump failed"; exit "$STATUS"; }

sha256sum "$OUT" > "${OUT}.sha256"
pg_restore --list "$OUT" > "${OUT}.toc"
```

Properties required by this stage:

| Requirement | How it is met |
| --- | --- |
| Custom format | `--format=custom` |
| Timestamped name | UTC `YYYYMMDDTHHMMSSZ` |
| Outside the repository | `$HOME/ncc-backups/` (0700) |
| No password in arguments | `.pgpass` / `PGPASSWORD`, `--no-password` |
| Captured exit code | `$?` written to `<dump>.status` |
| SHA-256 | `<dump>.sha256`, later checked with `sha256sum -c` |
| Archive verification | `pg_restore --list` to `<dump>.toc` |

Completeness is automatic: a full `pg_dump` of a database includes application
tables and data, enum types, indexes, constraints, triggers, functions and
`_prisma_migrations`. It does **not** include roles or tablespace definitions;
those are captured separately below. **[I]**

### 4.3 Manifest to write beside the dump (after approval)

```json
{
  "file": "ncc_dev-<stamp>.dump",
  "sha256": "<hash>",
  "bytes": 0,
  "created_utc": "<stamp>",
  "source": {
    "database": "ncc_dev",
    "host": "127.0.0.1",
    "port": 5432,
    "role": "pallav",
    "server_version": "18.6",
    "size": "10 MB"
  },
  "client": "pg_dump 18.6",
  "counts": {
    "tables": 21, "enums": 6, "indexes": 49,
    "foreign_keys": 14, "triggers": 3, "functions": 2,
    "migrations": 6
  },
  "restore_tested": false
}
```

### 4.4 Verification gate before the dump is accepted

1. `pg_dump` exit status is 0. **[P]**
2. `sha256sum -c <dump>.sha256` passes. **[P]**
3. `pg_restore --list` exits 0 and the `.toc` contains all 21 `TABLE` entries,
   all 6 `TYPE` entries, 49 `INDEX` entries, 14 `FK CONSTRAINT` entries,
   3 `TRIGGER` entries, 2 `FUNCTION` entries and the
   `_prisma_migrations` table data. **[P]**
4. The archive header reports `dbname: ncc_dev`. **[P]**
5. The file is outside the repository and not tracked by Git. **[P]**

If any check fails, the dump is discarded and retaken. It is never "fixed".

## 5. Restore-verification plan (not executed)

Restore is performed only in a separate, explicitly approved disposable
database, never into `ncc_dev` or production. **[A]**

### 5.1 Preconditions

- [ ] Fresh dump from §4 passed its verification gate.
- [ ] The disposable database name is unique:
      `ncc_restore_check_<UTC timestamp>`.
- [ ] The local role can create databases (`CREATE DATABASE` privilege).
- [ ] Sufficient local disk (the dump is currently ~29 KiB old / expect a few
      MB for the real one).
- [ ] Approval recorded with the dump's SHA-256.

### 5.2 Commands

```bash
RESTORE_DB="ncc_restore_check_$(date -u +%Y%m%dT%H%M%SZ)"

createdb --host=127.0.0.1 --port=5432 --username=pallav "$RESTORE_DB"
CREATED=$?

pg_restore \
  --host=127.0.0.1 --port=5432 --username=pallav \
  --dbname="$RESTORE_DB" \
  --no-owner --no-privileges \
  --exit-on-error \
  "$HOME/ncc-backups/ncc_dev-<stamp>.dump"
RESTORED=$?

echo "createdb=${CREATED} pg_restore=${RESTORED}"
```

- `--no-owner --no-privileges` avoids failures because the original objects are
  owned by another role. If ownership fidelity is required, restore as the
  original role instead and record that choice.
- `--exit-on-error` is required: without it `pg_restore` reports warnings and
  continues, which would hide a partial restore.

### 5.3 Comparison checklist

Run the same queries against `ncc_dev` and the restored database and compare
counts, not just "it ran".

| Check | Source query |
| --- | --- |
| Table count = 21 | `information_schema.tables` where `table_type = 'BASE TABLE'` |
| Enum count = 6 | `pg_type` join `pg_namespace`, `typtype = 'e'` |
| Index count = 49 | `pg_indexes` |
| FK count = 14 | `pg_constraint`, `contype = 'f'` |
| Trigger count = 3 | `information_schema.triggers` |
| Function count = 2 | `information_schema.routines` |
| Migration history = 6 rows, same names/order/checksums | `_prisma_migrations` |
| Key objects present | `User_deactivatedAt_idx`, `User_deactivatedById_fkey`, `CadetProfile_userId_fkey` = RESTRICT, all Phase 3 enums/tables |
| Row counts of the application tables | `count(*)` per table, compared table by table |

The restored database must also reproduce the known bookkeeping gap: six rows,
no `account_deactivation` row, no `approval_decision_source` row. **[I]**

### 5.4 Cleanup

```bash
dropdb --host=127.0.0.1 --port=5432 --username=pallav "$RESTORE_DB"
```

Cleanup runs even when the verification fails, so a half-restored database is
not left behind. Record the outcome in the manifest (`restore_tested: true`).

## 6. What is still missing

| Gap | Impact |
| --- | --- |
| No current PostgreSQL dump | Gate 1 unsatisfied; no rollback point exists |
| No restore rehearsal | The dump's restorability is unproven even once taken |
| Docs describe a non-existent dump | Operators may believe a rollback point exists |
| No manifests or restore logs | No audit trail of backup validity |
| Legacy SQLite files still present | Risk of using the wrong artifact |

The documentation gap is recorded here only. `README.md` and
`docs/MIGRATION_SAFETY.md` were **not** edited in this stage.

## 7. Approvals

| Action | Approval |
| --- | --- |
| Create the fresh dump in `~/ncc-backups/` | **required** |
| Create and drop a disposable restore database | **required**, separate |
| Edit `README.md` / `docs/MIGRATION_SAFETY.md` to correct the missing-dump claim | **required** |
| Delete or archive legacy SQLite files | **required**, out of scope |

**STOP.** No backup was created and no database was restored.

---

## 8. Update — fresh backup taken and verified (Phase 3.8.8)

This section records the outcome of the procedure that §4 and §5 only
proposed. Sections 1–7 are left intact as the historical record.

### 8.1 The fresh dump — BACKUP CREATED **[V]**

| Field | Value |
| --- | --- |
| Path | `/Users/pallav/ncc-backups/ncc_dev-20261107T070354Z.dump` |
| Size | 49,602 bytes |
| Permissions | `-rw-------` (0600); directory `~/ncc-backups/` is `0700` |
| Format | PostgreSQL custom archive, gzip |
| Source database | `ncc_dev` @ `127.0.0.1:5432` |
| Dumped from / dumped by | PostgreSQL 18.6 / `pg_dump` 18.6 (Homebrew) |
| Outside the repository | yes; not tracked by Git |
| Sidecar files | `.sha256`, `.toc`, `.manifest.json` (all 0600) |

This satisfies the §4.2 requirement for a current dump of `ncc_dev`, replacing
the unusable candidates of §3. **[I]**

### 8.2 Archive verification — BACKUP ARCHIVE VERIFIED **[V]**

| Check | Result |
| --- | --- |
| `pg_dump` exit status | 0 |
| `pg_restore --list` exit status | 0 |
| SHA-256 | `047826b73e3ebe0a44a316573c8df95d50b42fa722abbb5f1dc1a67e810cf502` |
| SHA-256 matches `.sha256` sidecar | yes |
| SHA-256 matches `.manifest.json` | yes |
| Archive header database | `ncc_dev` |

Object inventory in the archive, matching the §4.1 target identity:

| Object class | Count |
| --- | --- |
| Application tables | 21 |
| Enum types | 6 |
| Indexes | 49 (28 index TOC entries + 21 constraint-backed) |
| Foreign keys | 14 |
| Triggers | 3 |
| Functions | 2 |
| `_prisma_migrations` rows | 6 |

### 8.3 Restore rehearsal — REPORTED, NOT EVIDENCED **[H]**

A restore rehearsal into a disposable database
`ncc_restore_verify_20261107` was **reported** as successfully completed in an
earlier session, with all 21 tables, 6 enums, 49 indexes, 14 foreign keys,
3 triggers, 2 functions and 6 migration rows verified, row counts and
structural fingerprints matched, and the disposable database removed leaving
`ncc_dev` intact.

**That report has no accompanying artifact.** The manifest still records
`"restore_tested": false`, and no restore log, comparison report or manifest
update for `ncc_restore_verify_20261107` exists in `~/ncc-backups/`, in `docs/`,
in `scripts/`, or in the shell history checked. **[V]**

Therefore this document classifies the dump as:

| State | Status |
| --- | --- |
| Backup created | **YES** |
| Backup archive verified | **YES** |
| Backup restore-tested | **UNPROVEN** — asserted, unevidenced |

The distinction matters: the archive can be listed and its checksum proven,
but no artifact in the repository demonstrates that a restore of it produced
an equivalent database. Anyone relying on this dump as a rollback point should
re-run the rehearsal from §5 and write a log beside the dump first. **[I]**

### 8.4 The historical October backup — unchanged, still not a rollback point

`ncc-public-20261028-023444.dump` (29,144 bytes, SHA-256 `390ea008…425d9`) **is
not a valid current rollback point** and this update does not change that.

| Reason | Detail |
| --- | --- |
| Wrong database | archive header says `postgres`, not `ncc_dev` |
| Older server | dumped from PostgreSQL 17.11 |
| Pre-Phase-3 schema | 16 tables, 1 enum (`UserRole` only), 4 foreign keys |
| No deactivation schema | no `deactivatedAt` / `deactivatedById` / `deactivationReason`; `CadetProfile_userId_fkey` still CASCADE |
| No approval/M1 schema | no `approvalStatus`, `rosterId`, `approvalDecisionSource` |
| Migration history | 1 row only (`20261027000000_init_baseline`) |
| Restore-tested | no evidence |

It remains useful only as evidence of an earlier schema state. It must not be
used to restore any environment that has since received Phase 3. **[I]**

### 8.5 The older problem statement, and its correction

§1 concluded that "there is no usable PostgreSQL backup of `ncc_dev`" and that
"Gate 1 is not satisfied". That was true when written. As of §8.1–8.2 it is no
longer true for the archive-level requirement: a current, checksum-verified
dump of `ncc_dev` exists outside the repository. **[I]**

The documentation defect noted in §6 also remains open: `README.md` and
`docs/MIGRATION_SAFETY.md` still describe
`ncc-dev-pre-deactivation-20261102-024155.dump`, which does not exist. Neither
file is edited here; correcting them needs its own approval. **[V]**

### 8.6 Retention

No backup was moved, deleted or rotated. The 0600 permissions are intact. The
retention rules of §1.6 and the Stage 5 plan still apply, and deleting this
dump together with its `.toc` file requires owner approval. **[V]**
