# Production PostgreSQL Access — Administrator Handoff

**Status: awaiting administrator response. Gate 2 remains blocked until this is
answered.** No production connection has been made, and no role, permission,
schema or data change has been requested beyond the read-only inspection itself.

## 1. Purpose

We are preparing a controlled, read-only inspection of the production
PostgreSQL database. Application development and local database backup
verification are substantially complete.

Before finalising the migration reconciliation strategy we need the actual
production schema and Prisma migration history.

**No production migration or deployment is planned during this inspection.**

## 2. Step 1 — Verify production project identity

Please confirm the following through the Supabase dashboard:

| Information | Required response |
|---|---|
| Supabase project name | |
| Project reference | |
| Project region | |
| Production database name | |
| PostgreSQL version | |
| Is this the actual production project? (Yes / No) | |

Historical project reference, for investigation only:

```text
qkmpowtxkpbxelbbqdij
```

This reference has not been independently verified as the production project.
Please do not assume it is correct.

## 3. Step 2 — Check for an existing read-only account

Before creating a new account, please determine whether an existing PostgreSQL
role can fulfil these requirements.

Required capabilities:

- Connect to the production database.
- Read PostgreSQL system catalogs.
- Inspect application tables and columns.
- Read `_prisma_migrations`.
- Execute `SELECT` queries.
- Use read-only transactions.

Required restrictions:

- No `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`.
- No `CREATE`, `ALTER`, `DROP`.
- No permission changes.
- No role management.

| Information | Response |
|---|---|
| Existing read-only role available? | |
| Role name | |
| Can inspect application tables? | |
| Can inspect PostgreSQL catalogs? | |
| Can read migration history? | |
| Can establish `READ ONLY` transactions? | |

**Do not send the password.**

The built-in Supabase `postgres` role should not be used: it carries far more
privilege than this task requires.

## 4. Step 3 — Confirm connection endpoint

Please identify the recommended PostgreSQL connection endpoint. The repository
documentation expects the following, but it must be confirmed for this project:

| Field | Value |
|---|---|
| Hostname | |
| Port | |
| Database | |
| SSL required? | |
| Connection method | |

Expected method: Supabase **session** pooler, port `5432`, SSL required. The
direct `db.<project-ref>.supabase.co` host is not reachable from the deployment
platform, and the transaction pooler on port `6543` is unsuitable for
schema inspection.

**Do not provide the password in this response.**

## 5. Step 4 — If no existing read-only account is available

**STOP.** Do not create a role or grant privileges as part of this request.
Report that no suitable existing account is available.

Provisioning a new read-only account requires separate authorisation.

## 6. Step 5 — Secure credential delivery

If an existing suitable account is available:

1. Provide its connection details through an approved secure channel.
2. Keep the password separate from the project repository.
3. Configure the credential locally via `~/.pgpass` or a protected shell
   environment variable.
4. Ensure credentials never appear in command arguments, terminal logs,
   reports, or Git.

Never send credentials through chat.

## 7. What happens after access is established

A strictly read-only inspection covering:

- Production schema.
- Tables and columns.
- Enum types.
- Indexes and constraints.
- Foreign keys.
- Triggers and functions.
- Prisma migration history.
- Account deactivation state.
- `ApprovalDecisionSource` state.

Results will be compared against the verified local backup
(`ncc_dev-20261107T070354Z.dump`, SHA-256 `047826b7…0cf502`, restore-tested).

## 8. Explicit exclusions

This request does **not** authorise:

- Production schema modifications.
- Production data modifications.
- Migration execution.
- Migration-history repair.
- Database role creation.
- Permission changes.
- Production deployment.

Any such action requires separate approval.

## 9. Expected response

Please return:

1. Verified production project identity.
2. Existing read-only role availability.
3. Connection endpoint details.
4. Confirmation of whether the required read-only inspection is possible.

**The immediate goal is access verification, not database modification.**
