# Production readiness checklist

*Phase 3.7.1 · a checklist only. Nothing on this list has been performed on
the production deployment, and this stage did not access production.*

Every item states **what has to be true**, **how it is checked** and **what
the state is today**. The items are not ticked, because ticking them is the
decision of the operator who owns the deployment.

| Marker | Meaning |
| --- | --- |
| **verified** | checked on the local development machine; the same check has to be repeated against production |
| **open** | not checked at all, or not checked against production |
| **blocked** | cannot be completed until something else happens |

---

## 1. The secrets and the configuration

### [ ] A dedicated `AUDIT_HASH_KEY` is configured in production

**Why.** Since phase 3.7 the audit trail of the email addresses needs a
dedicated, stable key. In production a missing key, a key that is shorter
than 16 characters, or a key that repeats `AUTH_SECRET`, `NEXTAUTH_SECRET` or
`ATTENDANCE_CODE_SECRET` is refused. The refusal happens before the event is
written, so **every** change of the unit that carries its audit event is
rolled back with it.

**How it is checked (on the production console, never from this workstation):**

```bash
# the key is present and long enough
node -e "const k=process.env.AUDIT_HASH_KEY||'';console.log('length',k.trim().length)"

# the key is dedicated
node -e "const e=process.env;const k=(e.AUDIT_HASH_KEY||'').trim();
console.log('AUTH_SECRET',k===(e.AUTH_SECRET||'').trim());
console.log('NEXTAUTH_SECRET',k===(e.NEXTAUTH_SECRET||'').trim());
console.log('ATTENDANCE_CODE_SECRET',k===(e.ATTENDANCE_CODE_SECRET||'').trim());"
```

**How it is proved.** The reference of the same address has to be the same in
two separate processes. The proof is the test
`scripts/audit-hash-key.test.mjs` ("the reference is the same in two separate
processes when the key is configured"); on production it is a check that the
audit trail of the deployed application shows a stable reference.

**State.** **open.** The key is not configured anywhere in this repository,
and the local environment does not hold one either — the local machine falls
back to the development chain and, without it, to the random key of the
process with a warning. **This item blocks every production change that is
written with its audit event until it is done.**

### [ ] The other secrets of the production deployment are present

`DATABASE_URL`, `NEXTAUTH_SECRET` (or `AUTH_SECRET`), `NEXTAUTH_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.

**How it is checked.** The list of the deployment guide of `README.md`
against the environment of the production project. The values are never
printed into a report; only the presence and the length are.

**State.** **open** for production. **verified** for the local machine: the
local `.env` and `.env.local` hold `DATABASE_URL`, `NEXTAUTH_SECRET`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`,
`NEXT_PUBLIC_APP_URL` and the Supabase keys.

---

## 2. The database of production

### [ ] The migration history of production has been inspected

**Why.** The local database and the production database do not necessarily
have the same history. The phase 3 migration was edited after it was applied,
and the account deactivation migration was applied by hand in the local
database without being recorded.

**How it is checked.** The read-only query of the execution plan, step 2:

```sql
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY started_at;
```

The result is compared with the table of section 0.1 of
`docs/PHASE_3_6_STAGE_5_EXECUTION_PLAN.md`.

**State.** **open.** This stage did not connect to production. **verified**
for the local database: six rows, the phase 3 checksum `8031ecf3…82bac8`
against the file checksum `9b9c520d…5915ce`.

### [ ] The schema of production has been compared with the expected schema

**How it is checked.** The three read-only queries of the execution plan,
section 2.3, plus a comparison of the result with
`prisma/migrations/20261030080432_phase3_attendance_operations/migration.sql`
and `prisma/migrations/20261101090000_account_deactivation/migration.sql`.

**State.** **open** for production. **verified** for the local database: the
only difference between the live database and `prisma/schema.prisma` is the
`ApprovalDecisionSource` type and the `User.approvalDecisionSource` column
of the M1 migration.

### [ ] The reconciliation of the migrations is decided and executed

**How it is checked.** The steps 3 to 6 of
`docs/PHASE_3_6_STAGE_5_EXECUTION_PLAN.md`, with the approval of the owner
of the database.

**State.** **blocked** — every write operation of the plan is unapproved.

---

## 3. The storage of the profile photos

### [ ] The private Supabase bucket for the profile photos exists

**Why.** The bucket is private. The application writes with the service role
key and reads through a signed URL. A public bucket would expose the photos
of the cadets.

**How it is checked.** In the Supabase project of the deployment:

- the bucket exists, with the name of `PROFILE_PHOTO_BUCKET` (the default is
  `profile-photos`);
- the bucket is **private** (`public = false`);
- the service role key belongs to that project and not to another one.

**State.** **open.** The local environment holds the Supabase keys, but the
bucket of the deployment was not inspected in this stage.

### [ ] `PROFILE_PHOTO_STORAGE` is configured correctly

**Why.** The back end is opt in. When the variable is not set and the
process runs in production, the application refuses to serve the photo
feature with the message *"Profile photo storage is not configured for this
deployment"*. A development machine falls back to the local folder.

**How it is checked.**

```bash
node -e "console.log('PROFILE_PHOTO_STORAGE =', process.env.PROFILE_PHOTO_STORAGE)"
```

Expected in production: `supabase`. With `supabase` the variables
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` have to be present as well,
otherwise the application refuses the storage.

**State.** **open** for production. **verified** locally: `.env` holds
`PROFILE_PHOTO_STORAGE="local"`.

### [ ] The decision about a direct upload to the private storage is made

**Why.** The application limit of a photo is 5 MiB
(`PROFILE_PHOTO_MAX_BYTES` in `src/lib/profile-photo.mjs`), but the request
body of a function on Vercel is limited to 4.5 MB. A photo between 4.5 MB
and 5 MiB therefore passes the application limit and is refused by the
platform with `413 FUNCTION_PAYLOAD_TOO_LARGE`.

**The options.**

| Option | What it means | What it costs |
| --- | --- | --- |
| lower the application limit below the platform limit | one constant, no change of the architecture | photos between the new limit and 5 MiB are refused by the application with a clear message |
| upload directly to the private storage | the browser uploads with a signed URL, the request body of the function stays small | more code, a signed URL that has to expire, a bucket policy to write |
| do nothing | the limit stays at 5 MiB | a photo between 4.5 MB and 5 MiB fails with a platform error instead of an application message |

**State.** **open** — the decision is the decision of the owner. The
execution plan does not touch it.

---

## 4. The behaviour of the application, tested against production

Each item names the route or the service that carries the behaviour and the
test that covers it locally. The local test proves the **code**; the item is
about the **deployment**.

### [ ] The authentication works

**Route.** `src/app/api/auth/[...nextauth]/route.ts` ·
**Local test.** `scripts/access-control.test.mjs` (19 tests, all against the
local PostgreSQL).

**Check on production.** A Google sign in creates a `PENDING` account, the
pending page is shown, and the protected pages and APIs are refused.

### [ ] The approval by an administrator works

**Route.** `src/app/api/admin/cadets/route.ts` ·
**Local test.** `scripts/approval-integration.test.mjs` (7 tests against the
local PostgreSQL).

**Check on production.** An administrator approves a cadet, the decision
takes effect immediately, and the event reaches the audit trail.

### [ ] The synchronisation with the roster works

**Route.** `src/app/api/admin/roster/route.ts` ·
**Local test.** `scripts/roster-integration.test.mjs` (6 tests against the
local PostgreSQL).

**Check on production.** The import of the roster stores the rows, the
accounts that are matched are approved automatically, and the rows that
cannot be matched are reported.

### [ ] The check-in of the attendance works

**Route.** `src/app/api/attendance/check-in/route.ts` ·
**Local test.** `scripts/attendance-integration.test.mjs` (6 tests against
the local PostgreSQL).

**Check on production.** An eligible cadet checks in, a cadet that is not on
the roll is refused, and two check-ins at the same moment write exactly one
record.

### [ ] The QR attendance works

**Routes.** `src/app/api/admin/attendance/sessions/[id]/qr/route.ts`,
`src/app/api/attendance/sessions/route.ts` ·
**Local test.** `scripts/attendance-integration.test.mjs`, together with the
session routes of `src/app/api/admin/attendance/sessions/`.

**Check on production.** An administrator opens a session, the QR code is
issued, the cadet scans it, the record is written, and the token cannot be
used twice.

### [ ] The leave workflow works

**Routes.** `src/app/api/leave/route.ts`, `src/app/api/leave/[id]/route.ts`,
`src/app/api/leave/[id]/cancel/route.ts`,
`src/app/api/admin/leave/route.ts`, `src/app/api/admin/leave/[id]/route.ts` ·
**Local test.** `scripts/attendance-integration.test.mjs` and the leave
service of `src/lib/attendance-service.mjs`.

**Check on production.** A cadet requests a leave, an administrator approves
or rejects it, the cadet sees the decision, the record keeps its owner.

### [ ] The audit trail works

**Route.** every privileged write ·
**Local test.** `scripts/audit-integration.test.mjs` (6 tests against the
local PostgreSQL) and `scripts/audit-rollback-integration.test.mjs` (3 tests
against the local PostgreSQL).

**Check on production.** The address of a cadet is stored as `hmac:…` and
never as a value, the credentials and the tokens never reach the trail, and
a change without a trail is rolled back. **This check needs a dedicated
`AUDIT_HASH_KEY`, see item 1.1.**

### [ ] A deactivated account is blocked

**Service.** `src/lib/account-service.mjs` ·
**Local test.** `scripts/deactivation.test.mjs` (9 tests against the local
PostgreSQL, 1 test against the development server) and
`scripts/account-deactivation.test.mjs` (12 unit tests on the fake
database).

**Check on production.** A deactivated cadet cannot sign in, cannot check in,
cannot use the cadet API and is not counted as an active administrator. The
attendance rows, the leave requests, the profile and the audit history of the
account stay in the database.

### [ ] A member of the roster who is not active is excluded from the attendance

**Service.** `src/lib/roster-service.mjs` and the roll of
`src/app/api/admin/attendance/roll/route.ts` ·
**Local test.** `scripts/roster-integration.test.mjs` and
`scripts/attendance-integration.test.mjs`.

**Check on production.** A roster row with `active = false` does not appear
in the roll of the attendance, and the account behind it is not approved by
the synchronisation.

---

## 5. The build and the deployment

### [ ] The production build is verified

**How it is checked.**

```bash
npm run build
```

Expected: `Compiled successfully` and `Generating static pages using 9
workers (58/58)`.

**State.** **verified** on the local machine: the build compiles and the 58
static pages are generated, with the TypeScript check clean and the lint
without an error. The build that is deployed has to be the same commit.

### [ ] The rollback of the deployment is documented

**Why.** Two different rollbacks are needed and they are not the same thing.

| Rollback | What it restores | How |
| --- | --- | --- |
| the **code** | the previous version of the application | the previous deployment of Vercel, or a re-deploy of the previous commit |
| the **data** | the state of the database before the reconciliation | the restore of the verified backup of step 1 of the execution plan |

**What has to be written down.**

- the commit that is deployed now, and the commit to go back to;
- the location of the backup of the database and the date of its verification;
- the exact command of the restore, with the database identity it belongs to;
- who decides, and how long the decision takes;
- the fact that the backup of step 1 predates the deactivation and **is not**
  a rollback point for the reconciliation — a new one has to be taken.

**State.** **open.**

---

## 6. The summary

The list is the checklist. An item is ticked only by the operator who owns
the deployment, after the check in its section has been carried out.

### 1. The secrets and the configuration

- [ ] **1.1** A dedicated `AUDIT_HASH_KEY` is configured in production — **open**, blocks every audited change
- [ ] **1.2** The other secrets of the production deployment are present — **open**

### 2. The database of production

- [ ] **2.1** The migration history of production has been inspected — **open**
- [ ] **2.2** The schema of production has been compared with the expected schema — **open**
- [ ] **2.3** The reconciliation of the migrations is decided and executed — **blocked**, unapproved

### 3. The storage of the profile photos

- [ ] **3.1** The private Supabase bucket for the profile photos exists — **open**
- [ ] **3.2** `PROFILE_PHOTO_STORAGE` is configured correctly — **open**
- [ ] **3.3** The decision about a direct upload to the private storage is made — **open**

### 4. The behaviour of the application, tested against production

- [ ] **4.1** The authentication works — **open**
- [ ] **4.2** The approval by an administrator works — **open**
- [ ] **4.3** The synchronisation with the roster works — **open**
- [ ] **4.4** The check-in of the attendance works — **open**
- [ ] **4.5** The QR attendance works — **open**
- [ ] **4.6** The leave workflow works — **open**
- [ ] **4.7** The audit logging works — **open**, needs 1.1
- [ ] **4.8** A deactivated account is blocked — **open**
- [ ] **4.9** An inactive member of the roster is excluded from the attendance — **open**

### 5. The build and the deployment

- [ ] **5.1** The production build is verified — **verified** on the local machine, still to be repeated for the deployed commit
- [ ] **5.2** The deployment rollback plan is documented — **open**

Nothing on this list changes the database of production, and nothing on this
list was performed against production in this stage.

---

## 7. The other checklist of the unit

`docs/PHASE_3_6_PRODUCTION_READINESS_CHECKLIST.md` is an earlier checklist of
the same readiness, written by another stage. It covers the same items with
the same wording for the `AUDIT_HASH_KEY` and it is **not** superseded by
this document; this document does not modify it. The items that this
document adds are the **backup** of the reconciliation and the **rollback of
the deployment**, which the earlier checklist does not carry.

The two documents of the reconciliation that go with this checklist are
`docs/PHASE_3_6_STAGE_5_EXECUTION_PLAN.md` and
`docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md`.
