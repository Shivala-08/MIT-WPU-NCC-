# Phase 3.8 — Gate 2: Production Migration Inventory

**Status: preparation only. No production connection was made, no production
credential was read, and no query was executed anywhere except the local
`ncc_dev` database.**

Labels used throughout:

- **[V] Verified** — read from the local repository or local database this
  session.
- **[H] Historical** — from project documentation or a previous report.
- **[I] Inferred** — a conclusion from the verified facts.
- **[P] Proposed** — a query or command for the operator.
- **[A] Approval required.**

Local reference state: branch `fix/auth-identity`, HEAD
`96987cfee3a4928cbec7f6d35accd4cd8da5c0fb`. **[V]**

## 1. Why this gate exists

Production history is unknown. The local database has two bookkeeping
anomalies; production may have the same, different, or additional ones. A
migration plan that assumes parity would be unsafe. Gate 2 collects evidence
only; it does not chmod, repair or apply anything. **[I]**

## 2. Local reference values (verified)

Read from `ncc_dev` this session. **These are the left-hand side of every
comparison; they are not values to be written into production.**

| Property | Local value |
| --- | --- |
| Database | `ncc_dev` @ `127.0.0.1:5432` |
| PostgreSQL server | 18.6 (Homebrew) |
| Size | 10 MB |
| Tables | 21 |
| Enums | 6: `ApprovalStatus`, `AttendanceSessionStatus`, `AttendanceStatus`, `LeaveStatus`, `LeaveType`, `UserRole` |
| Indexes | 49 |
| Foreign keys | 14 |
| Triggers | 3 |
| Functions | 2 |
| `_prisma_migrations` rows | 6 |

### 2.1 Local migration history

**[V]** All six rows are finished and none is rolled back.

| # | `migration_name` | Local checksum (prefix → suffix) | Local state |
| --- | --- | --- | --- |
| 1 | `20261026000000_core_tables` | `fe3db57a…d12e5` | applied |
| 2 | `20261027000000_init_baseline` | `64797f0c…0c871` | applied |
| 3 | `20261029000000_account_approval_and_roster` | `29112131…92338` | applied |
| 4 | `20261030000000_cadet_profile_completion` | `7453b4c5…920d9` | applied |
| 5 | `20261030080432_phase3_attendance_operations` | stored `8031ecf3…2bac8` / file `9b9c520d…915ce` | applied, **checksum mismatch** |
| 6 | `20261030210643_phase3_manual_fallback_code` | `98ded183…36d6d` | applied |
| — | `20261101090000_account_deactivation` | no row | schema applied, **unrecorded** |
| — | `20261105000000_approval_decision_source` | no row | **not applied** |

### 2.2 Local schema facts relevant to the comparison

**[V]**

- `User.deactivatedAt`, `User.deactivatedById`, `User.deactivationReason` exist.
- `User_deactivatedAt_idx` exists.
- `User_deactivatedById_fkey` exists with `ON DELETE SET NULL`.
- `CadetProfile_userId_fkey` has `confdeltype = 'r'` (`ON DELETE RESTRICT`).
- `ApprovalDecisionSource` enum **does not exist**.
- `User.approvalDecisionSource` **does not exist**.
- Phase 3 enums `AttendanceSessionStatus`, `AttendanceStatus`, `LeaveStatus`,
  `LeaveType` exist; Phase 3 tables and the fallback-code table exist.
- `prisma migrate diff` from the database to `schema.prisma` emits **only** the
  M1 enum and column — no other drift.

## 3. Read-only query set

Run these with a **read-only** production role (or the Supabase SQL editor in
a read-only session). Each query is a `SELECT`; none writes.

### 3.1 History

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

Do **not** select the `logs` column: it is not needed, and it is the only column
that could contain statement fragments.

### 3.2 Migration integrity summary

```sql
SELECT
    count(*)                                            AS total_rows,
    count(*) FILTER (WHERE finished_at IS NULL)         AS unfinished,
    count(*) FILTER (WHERE rolled_back_at IS NOT NULL)  AS rolled_back
FROM "_prisma_migrations";
```

A non-zero `unfinished` or `rolled_back` value changes the plan: Prisma refuses
the chain with `P3009` until the failed row is resolved. **[I]**

### 3.3 Deactivation objects

```sql
-- Columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'User'
  AND column_name IN ('deactivatedAt', 'deactivatedById', 'deactivationReason')
ORDER BY column_name;

-- Index
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'User'
  AND indexname = 'User_deactivatedAt_idx';

-- Self foreign key and profile foreign key
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN ('User_deactivatedById_fkey', 'CadetProfile_userId_fkey');

-- History row
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name = '20261101090000_account_deactivation';
```

Expected values if production matches local: three columns, one index,
`ON DELETE SET NULL` for the self reference, `ON DELETE RESTRICT` for
`CadetProfile_userId_fkey`, and **no** history row.

### 3.4 M1 objects

```sql
SELECT e.enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname = 'ApprovalDecisionSource'
ORDER BY e.enumsortorder;

SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'User'
  AND column_name = 'approvalDecisionSource';

SELECT migration_name, checksum
FROM "_prisma_migrations"
WHERE migration_name = '20261105000000_approval_decision_source';
```

Expected if M1 has not been applied: zero enum labels, zero column rows, zero
history rows.

### 3.5 Phase 3 objects

```sql
SELECT t.typname
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typtype = 'e'
  AND t.typname IN ('AttendanceSessionStatus', 'AttendanceStatus',
                    'LeaveStatus', 'LeaveType', 'ApprovalStatus')
ORDER BY t.typname;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name IN ('AttendanceSession', 'Attendance', 'AttendanceQrToken',
                     'AttendanceManualCode', 'AttendancePolicy',
                     'LeaveRequest', 'Roster')
ORDER BY table_name;
```

### 3.6 Identity and version

```sql
SELECT current_database()                     AS database,
       current_user                           AS role,
       current_setting('server_version')      AS server_version,
       inet_server_addr()::text               AS server_address,
       inet_server_port()                     AS server_port,
       pg_size_pretty(pg_database_size(current_database())) AS size;
```

Caveats: behind Supabase's pooler, `inet_server_addr()` may report the pooler
address rather than the database host. Record what the query returns and note
the pooler separately; do not infer the host from it. **[I]**

## 4. Evidence the operator must supply

1. Output of §3.1 (migration history), as CSV or text. **[P]**
2. Output of §3.6 (PostgreSQL version + identity). **[P]**
3. Explicit database identity confirmation: Supabase project reference and
   database name, as displayed in the dashboard — **not** a connection string.
   **[P]**
4. Whether the six deactivation objects of §3.3 exist (present/absent each).
   **[P]**
5. Whether the M1 enum and column of §3.4 exist (present/absent each). **[P]**
6. Whether any migration has `finished_at IS NULL` or `rolled_back_at IS NOT
   NULL` — the §3.2 counts plus the rows. **[P]**
7. Optionally, the §3.5 Phase 3 object list, to confirm the chain was applied
   in the same order. **[P]**

### 4.1 Never request or transmit

- Database passwords of any role.
- Full connection strings (`postgresql://…`), including pooled ones.
- Supabase `service_role` keys or secret keys.
- `AUTH_SECRET`, `NEXTAUTH_SECRET`, `AUDIT_HASH_KEY`.
- The contents of the `logs` column.
- Row data from `User`, `CadetProfile`, `Attendance` or `LeaveRequest`.

If a screenshot of the SQL editor is used, crop the connection banner.

## 5. Local-versus-production comparison template

Fill only the production columns. **"Unknown" must remain "Unknown" until
evidence arrives.** **[P]**

| Migration | Local | Production | Difference | Consequence |
| --- | --- | --- | --- | --- |
| `20261026000000_core_tables` | Applied, `fe3db57a…` | Unknown | | |
| `20261027000000_init_baseline` | Applied, `64797f0c…` | Unknown | | |
| `20261029000000_account_approval_and_roster` | Applied, `29112131…` | Unknown | | |
| `20261030000000_cadet_profile_completion` | Applied, `7453b4c5…` | Unknown | | |
| `20261030080432_phase3_attendance_operations` | Applied, stored `8031ecf3…`, file `9b9c520d…` | Unknown | | |
| `20261030210643_phase3_manual_fallback_code` | Applied, `98ded183…` | Unknown | | |
| `20261101090000_account_deactivation` | Schema applied, **no history row** | Unknown | | |
| `20261105000000_approval_decision_source` | **Not applied** | Unknown | | |
| *any migration absent locally* | — | Unknown | | |

### 5.1 How to classify each difference

| Production observation | Meaning | Plan branch |
| --- | --- | --- |
| Same name, same checksum, finished | In step with local | no action |
| Phase 3 row stores `8031ecf3…` | Same edit history as local | Gate 4 decision applies unchanged |
| Phase 3 row stores `9b9c520d…` | Production was migrated from the edited file, or already reconciled | **stop**; the Gate 4 matrix is the wrong decision set — re-analyse |
| Phase 3 row stores neither value | Unknown provenance | **stop**; do not resolve |
| Deactivation objects present, no row | Same gap as local | Gate 3 resolve is applicable after verification |
| Deactivation objects absent, no row | Migration genuinely pending | Gate 3 is **not** applicable; the migration must be applied normally |
| Deactivation objects partially present | Half-applied schema | **stop**; manual repair only with approval |
| Deactivation row present | Already reconciled | no action; check its checksum against the file |
| M1 objects absent, no row | M1 pending | Gate 5 as written |
| M1 objects present, no row | Manual application without bookkeeping | use `resolve --applied`, not `deploy` |
| M1 row present | already applied | no action |
| Any `finished_at IS NULL` or `rolled_back_at` row | Failed/rolled-back migration | **stop**; resolve before anything else |
| Extra migration in production not in the repository | History divergence | **stop**; recover the missing migration file first |

## 6. How the comparison is used

1. Gate 3 (deactivation resolve) may proceed **per environment** only when that
   environment's deactivation objects all exist and its history row is absent.
2. Gate 4 (checksum decision) may proceed only after the production Phase 3
   checksum is known and equals the stored local value. A different value
   invalidates the matrix.
3. Gate 5 (M1) may proceed only when the M1 objects are absent and the chain is
   otherwise deployable.
4. Any "stop" row above ends the stage for that environment.

No production value may be assumed, copied from local, or left blank in a way
that implies it was checked. **[I]**

## 7. Guard usage

All future Prisma inspection must go through the guard:

```bash
node scripts/prisma-guard.mjs check
node scripts/prisma-guard.mjs migrate status
node scripts/prisma-guard.mjs migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script
```

- `migrate status` and `migrate diff` are in the guard's read-only set. **[V]**
- `migrate deploy` and `migrate resolve` are production-write commands and
  require `PRISMA_ALLOW_PRODUCTION=1` plus approval. **[V]**
- The guard never prints credentials. **[V]**

This stage does not run any of these against production.

## 8. Gate 2 acceptance criteria

- [ ] All six evidence items of §4 supplied.
- [ ] Every row of §5 has a production value or an explicit "not checked".
- [ ] Every difference has a classification from §5.1.
- [ ] No connection string, password or key was transmitted.
- [ ] The comparison is attached to the Stage 5 record.

**STOP.** Production was not contacted and no production value is asserted.
