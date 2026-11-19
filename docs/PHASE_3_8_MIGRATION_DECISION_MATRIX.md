# Phase 3.8 — Migration Decision Matrix (Gates 3, 4, 5 Preparation)

**Status: preparation only. No option is selected. No migration was applied,
resolved, rolled back, pushed or edited. No database was written.**

Labels:

- **[V] Verified** — read from the local database or repository this session.
- **[H] Historical** — from existing project documentation; not re-executed.
- **[I] Inferred**.
- **[P] Proposed** — for a later, approved stage.
- **[A] Approval required.**

This document prepares three gates. It deliberately ends with no decision.

---

## Part A — Gate 4: Phase 3 checksum decision

Migration: `20261030080432_phase3_attendance_operations`

| Item | Value | Source |
| --- | --- | --- |
| Checksum stored in `_prisma_migrations` | `8031ecf36db288041efa2c4d741c12e74e402ba0ceda9b85111f7f745182bac8` | **[V]** |
| Checksum of the file on disk | `9b9c520d85b45ab1f98bec2c0aad803e47860e0c65fa56bd6a28ad49ce5915ce` | **[V]** |
| Schema produced by the current file | matches `ncc_dev` exactly (drift = M1 only) | **[V]** |
| Nature of the conflict | bookkeeping only; the schema is correct | **[I]** |

Prisma compares the hash of every applied migration with the file. A difference
stops the chain before anything is applied. **[H]** — documented in
`docs/MIGRATION_SAFETY.md` §5.

### A.1 Matrix

| Dimension | 1. Leave unresolved | 2. Restore the applied file | 3. Compare-and-swap the checksum | 4. Resolve rolled-back, redeploy | 5. Rebuild / baseline history |
| --- | --- | --- | --- | --- | --- |
| **Prisma officially supports** | Yes (do nothing) | Yes — file hash equals stored hash | **No** — no command refreshes a checksum of an applied migration | The command succeeds; the deploy **fails** | Baselining an existing DB is documented; deleting history is not supported |
| **Database state changed** | None | None | One row of `_prisma_migrations` | Bookkeeping says "rolled back"; schema unchanged until the failing deploy | Bookkeeping replaced by one baseline row |
| **Existing databases** | `migrate deploy` refuses the chain permanently | Accepted again; the chain can continue | Accepted again after the single-row update, per database | **Leaves a failed migration row**; chain blocked | Each needs one `resolve --applied` for the baseline |
| **Fresh installations** | Apply the current chain; succeed | Apply the older SQL; succeed | Unaffected — a fresh DB records the file hash itself | Unaffected by the decision, but the repo history is unchanged | Built from one baseline; per-migration provenance gone |
| **History preserved** | Fully | Fully (reverts the file, keeps the applied content) | Fully, except the hash value | No — a false rolled-back state is recorded | **Lost** — the chain becomes one synthetic row |
| **Operational risk** | M1 can never be deployed via Prisma; permanent limitation | Loses the safety guards added after the original apply; reconstruction must hash-verify | Edits Prisma's bookkeeping outside Prisma; must be transactional and recorded; future Prisma versions may differ | **High** — guaranteed failure and a blocked chain | **Highest** — irreversible collapse of provenance; baseline drift |
| **Approvals needed** | Owner accepts the limitation | Owner + DB owner | Owner + DB owner + written change record | Not recommended | Owner + DB owner + architecture sign-off |

### A.2 Option detail

**Option 1 — Leave unresolved.**
Nothing changes. Fresh databases work; every database that already applied the
Phase 3 migration stays refused for `migrate deploy`. The application is not
affected because it reads the schema, not the history. This is the current
state and the default if no decision is made. **[V]**

**Option 2 — Restore the historically applied migration file.**
The pre-edit content must be recovered and must hash to `8031ecf3…` before it is
accepted. This is the only option that makes a fresh database reproduce exactly
what existing databases received, and the only one that is both Prisma-supported
and leaves the database untouched. It permanently discards the idempotence and
`btrim` guard improvements in the edited file. **[I]**

**Option 3 — Compare-and-swap the stored checksum.**
No Prisma command does this. It is a single-row update, and it must be written
so that it either changes exactly one row or changes nothing:

```sql
BEGIN;

UPDATE "_prisma_migrations"
SET checksum = '9b9c520d85b45ab1f98bec2c0aad803e47860e0c65fa56bd6a28ad49ce5915ce'
WHERE migration_name = '20261030080432_phase3_attendance_operations'
  AND checksum = '8031ecf36db288041efa2c4d741c12e74e402ba0ceda9b85111f7f745182bac8';

-- The operator must see exactly 1, otherwise ROLLBACK.
-- COMMIT only after the count is confirmed.

COMMIT;
```

Requirements before it could ever run: a verified fresh backup, the exact
previous value recorded, one environment at a time, and an explicit statement
that Prisma does not sanction it. It is **not executed** here and is **not**
approved. **[P/A]**

**Option 4 — `resolve --rolled-back` then deploy.**
Rejected. The migration is not idempotent: it creates four enum types and three
tables without `IF NOT EXISTS`, drops a foreign key it already dropped, and its
status guard calls `btrim()` on a column that is now an enum, which PostgreSQL
does not provide. The deploy would fail and leave a **failed** row that blocks
every migration behind it, including M1. This is a property of the SQL, not a
matter of preference. **[H]** — analysed in `docs/MIGRATION_SAFETY.md` §5.1.

**Option 5 — Rebuild or baseline the history.**
Generate a baseline from `schema.prisma`, retire the eight migration
directories, and record the baseline as applied on existing databases. It is
supported for adopting an existing database, but it destroys the per-migration
provenance and makes production and local histories incomparable. It also
conflates two independent problems (the stale checksum and the unapplied M1).
`prisma/baseline-candidate/` is evidence of how a baseline candidate can drift;
it must not be used as the replacement. **[I]**

### A.3 Decision record (to be completed only when approved)

| Field | Value |
| --- | --- |
| Option chosen | |
| Approved by | |
| Environment(s) | |
| Backup identifier | |
| Exact commands | |
| Expected `_prisma_migrations` change | |
| Rollback | |
| Date | |

---

## Part B — Gate 3: Account deactivation preparation

Migration: `20261101090000_account_deactivation`
File checksum: `4ef0c67312d5a1ca70ffd7b71485e607708d4dbef5704f6a26059801bf1b81c0` **[V]**

Local state: all schema effects present, **no history row**. **[V]**

Proposed command (**not executed**):

```bash
node scripts/prisma-guard.mjs migrate resolve --applied 20261101090000_account_deactivation
```

### B.1 Preconditions — all must be true per database

| # | Precondition | Verification |
| --- | --- | --- |
| 1 | `User.deactivatedAt` exists | `information_schema.columns` |
| 2 | `User.deactivatedById` exists | `information_schema.columns` |
| 3 | `User.deactivationReason` exists | `information_schema.columns` |
| 4 | `User_deactivatedAt_idx` exists | `pg_indexes` |
| 5 | `User_deactivatedById_fkey` exists, `ON DELETE SET NULL` | `pg_constraint` |
| 6 | `CadetProfile_userId_fkey` is `ON DELETE RESTRICT` (`confdeltype = 'r'`) | `pg_constraint` |
| 7 | No row for this migration | `_prisma_migrations` |
| 8 | File hash is still `4ef0c673…` | `shasum -a 256` |
| 9 | A verified backup exists for that environment | Gate 1 manifest |
| 10 | No other migration is in a failed/rolled-back state | Gate 2 §3.2 |

`resolve --applied` records the **current file hash** and does not run the SQL.
If the file is edited afterwards, the same class of checksum conflict returns.

### B.2 When it must not be used

- Any of preconditions 1–6 false → the migration is genuinely pending or
  half-applied; `resolve` would hide the gap.
- A row already exists → the command fails with `P3008` and does not refresh the
  hash.
- Precondition 10 false → resolve the failed row first; the cause matters.
- Production evidence absent → production is not a candidate yet.

### B.3 Post-condition

`migrate status` no longer lists the migration as pending, and the newest
migration remains `20261030210643_phase3_manual_fallback_code` until M1.

---

## Part C — Gate 5: M1 preparation

Migration: `20261105000000_approval_decision_source`
File checksum: `47c3e4b871117ddee309bec0886d454f758a016be2dc0300648c5249f2c2e247` **[V]**

Current state: file exists, not applied, enum and column absent. **[V]**

Expected schema:

- enum `ApprovalDecisionSource` = `NONE`, `AUTOMATIC`, `ADMINISTRATOR`;
- `User.approvalDecisionSource` `NOT NULL DEFAULT 'NONE'`;
- backfill `ADMINISTRATOR` where `approvedById IS NOT NULL`;
- backfill `AUTOMATIC` where `approvalStatus = 'APPROVED'`,
  `approvedById IS NULL`, `rosterId IS NOT NULL`;
- every other row `NONE`.

### C.1 Pre-migration checks (read only)

```sql
-- Must both be absent.
SELECT 1 FROM pg_type WHERE typname = 'ApprovalDecisionSource';
SELECT 1 FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'User'
  AND column_name = 'approvalDecisionSource';

-- Backfill population, recorded before the change.
SELECT
  count(*) FILTER (WHERE "approvedById" IS NOT NULL)                    AS administrator,
  count(*) FILTER (WHERE "approvalStatus" = 'APPROVED'
                     AND "approvedById" IS NULL
                     AND "rosterId" IS NOT NULL)                        AS automatic,
  count(*) FILTER (WHERE "approvalStatus" = 'APPROVED'
                     AND "approvedById" IS NULL
                     AND "rosterId" IS NULL)                            AS approved_without_source,
  count(*)                                                              AS total_users
FROM "User";
```

Local values today: `administrator = 0`, `automatic = 0`,
`approved_without_source = 1`, `total_users = 1`. **[V]** The single row is the
seeded development administrator; it would become `NONE`.

`approved_without_source` is the only number that needs a human decision. If it
is non-zero in production, confirm that `NONE` is the correct history for those
accounts before applying. **[P/A]**

### C.2 Execution

Preferred, after Gate 4 is resolved and Gate 3 is recorded:

```bash
node scripts/prisma-guard.mjs migrate deploy
```

This applies only M1. It must not be used while the Phase 3 checksum differs or
while the deactivation migration has no row — it would stop before M1.

The application works with and without the column (it probes the catalog and
falls back to `approvedById`), so code deployment and migration may be separate
events in either order. **[V]**

### C.3 Backfill population report (required after execution)

Capture and attach:

| Metric | Expected |
| --- | --- |
| `count(*) GROUP BY approvalDecisionSource` | sums to `total_users`; `NONE` = pre-migration `approved_without_source` |
| rows with `approvedById IS NOT NULL` and source ≠ `ADMINISTRATOR` | 0 |
| rows with `APPROVED`, no `approvedById`, `rosterId` present, source ≠ `AUTOMATIC` | 0 |
| rows with `approvalDecisionSource IS NULL` | 0 |
| `administrator` count | equals pre-migration value |
| `automatic` count | equals pre-migration value |

### C.4 Post-migration schema assertions

```sql
SELECT column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'User'
  AND column_name = 'approvalDecisionSource';

SELECT e.enumlabel
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'ApprovalDecisionSource'
ORDER BY e.enumsortorder;
```

Expect `NO`, default `'NONE'::"ApprovalDecisionSource"`, and the three labels in
order.

### C.5 Application compatibility tests

| Check | Command | Expected |
| --- | --- | --- |
| Full suite | `npm test` | 281 pass, 0 fail, 0 skip |
| Attendance | `npm run test:attendance` | 88 pass |
| Types | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | exit 0 |
| Behaviour | admin rejects → roster match → sign-in | administrator decision preserved |

These are the Phase 3.7.1 baseline results; M1 changes the window the
`approval-integration` suite asserts. **[V]**

### C.6 Schema-drift verification

```bash
node scripts/prisma-guard.mjs migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script
```

Expected after M1: empty. Before M1 the local drift is exactly the enum and the
column. **[V]**

### C.7 Recovery procedure

1. Stop the application.
2. Restore the Gate 1 dump into the environment (owner-approved) and redeploy
   the previous build. This is the primary rollback.
3. Manual revert (drop column, drop enum) is possible but leaves the M1 history
   row in place, recreating a checksum/schema disagreement. It is **not** the
   preferred path and needs its own approval.
4. Prisma has no down migration; never improvise `migrate resolve` after a
   partial manual revert.

---

## Part D — Summary of approvals

| Action | Gate | Approval |
| --- | --- | --- |
| Create the fresh dump | 1 | **required** |
| Restore into a disposable database | 1 | **required**, separate |
| Read production history | 2 | **required** (read-only role) |
| `migrate resolve --applied 20261101090000_account_deactivation` | 3 | **required**, per environment |
| Any Option 1–5 of the checksum matrix | 4 | **required**, written decision record |
| `migrate deploy` for M1 | 5 | **required** |
| Manual M1 apply + `resolve --applied` | 5 | **required**, separate |
| Production deployment | after 5 | **required**, out of scope |

## Part E — What this document does not do

- It does not choose a checksum option.
- It does not execute `resolve`, `deploy`, `push`, `reset` or `db execute`.
- It does not modify `_prisma_migrations`.
- It does not edit either Phase 3 migration, M1, or `prisma/baseline-candidate/`.
- It does not connect to production.

**STOP.** Awaiting explicit approval before Gate 1 or Gate 2 operations begin.
