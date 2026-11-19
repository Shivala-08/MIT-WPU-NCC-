# Phase 3.6 — Production Readiness Checklist

**Status: not started. No production configuration was read or changed.**

Every box is unchecked on purpose. A box may be ticked only when the evidence
named beside it exists and is attached to the release record. "It works
locally" is not evidence.

| Field | Value |
| --- | --- |
| Release / stage | Phase 3.6 (Stage 5 pending) |
| Branch | `fix/auth-identity` |
| HEAD | `96987cfee3a4928cbec7f6d35accd4cd8da5c0fb` |
| Prepared on | 2026-11-07 |
| Sign-off required from | project owner + database owner |

## A. Security and secrets

- [ ] **Dedicated `AUDIT_HASH_KEY` configured.**
  - Evidence: the variable is present in the production environment, is at
    least the minimum length enforced by `audit-hash-key.test.mjs`, is not equal
    to `AUTH_SECRET`/`NEXTAUTH_SECRET`, and is stored only in the hosting
    secret store.
  - Failure mode if missed: audit writes are refused in production by design.
  - Owner: ________  Verified on: ________

- [ ] **Production migration history inspected** (read-only).
  - Evidence: the output of the `_prisma_migrations` query, compared with the
    local history table, including any failed or rolled-back row.
  - Reference: `docs/PHASE_3_6_STAGE_5_EXECUTION_PLAN.md` §2.
  - Owner: ________  Verified on: ________

- [ ] **Production schema compared with the expected schema.**
  - Evidence: empty `prisma migrate diff` between production and
    `prisma/schema.prisma`, or a documented, approved difference.
  - Owner: ________  Verified on: ________

## B. Storage and photos

- [ ] **Private Supabase photo bucket configured.**
  - Evidence: bucket exists, is **not** public, and its access policy allows
    only the service role used by the application.
  - Owner: ________  Verified on: ________

- [ ] **`PROFILE_PHOTO_STORAGE` configured correctly.**
  - Evidence: the production value selects the Supabase storage backend, and a
    test upload lands in the private bucket rather than on the local filesystem.
  - Owner: ________  Verified on: ________

- [ ] **Direct-to-private-storage photo upload decision made.**
  - Evidence: a written decision on whether uploads go through the application
    route or directly to storage with a signed URL, including the size limit and
    the content-type validation that applies in that path.
  - Owner: ________  Verified on: ________

## C. Functional verification (production or production-like)

- [ ] **Authentication tested.**
  - Evidence: college-domain sign-in succeeds; a personal domain is refused; an
    unverified Google email is refused.
  - Owner: ________  Verified on: ________

- [ ] **Admin approval tested.**
  - Evidence: approve and reject both work, are audited, and an administrator
    decision is not overwritten by a later roster match or sign-in.
  - Owner: ________  Verified on: ________

- [ ] **Roster synchronisation tested.**
  - Evidence: an import creates/links rows, preserves cadet-entered fields, and
    never changes an approval state.
  - Owner: ________  Verified on: ________

- [ ] **Attendance check-in tested.**
  - Evidence: an eligible cadet is marked once; a duplicate check-in is refused;
    the record is written with the acting officer.
  - Owner: ________  Verified on: ________

- [ ] **QR attendance tested.**
  - Evidence: a QR token checks in the same record as the manual path, expires,
    and cannot be replayed.
  - Owner: ________  Verified on: ________

- [ ] **Leave workflow tested.**
  - Evidence: submission, approval, rejection and cancellation each produce the
    expected state and audit event.
  - Owner: ________  Verified on: ________

- [ ] **Audit logging tested.**
  - Evidence: a privileged change appears in the trail with the acting user;
    personal data is redacted; a failed audit write rolls the change back in
    production.
  - Owner: ________  Verified on: ________

- [ ] **Deactivated accounts blocked.**
  - Evidence: a deactivated account cannot sign in, cannot call the cadet API
    and cannot check in; its attendance, leave and profile rows are retained.
  - Owner: ________  Verified on: ________

- [ ] **Inactive roster members excluded from attendance.**
  - Evidence: an inactive roster row is absent from the roll and cannot check
    in, but may still submit a leave request.
  - Owner: ________  Verified on: ________

- [ ] **Production build verified.**
  - Evidence: `npm run build` on the release commit exits 0; the deployed build
    id matches the commit.
  - Owner: ________  Verified on: ________

## D. Operations

- [ ] **Deployment rollback plan documented.**
  - Evidence: the previous build is deployable, the pre-migration database dump
    is identified and verified, and the restore procedure and its owner are
    recorded.
  - Reference: `docs/PHASE_3_6_STAGE_5_EXECUTION_PLAN.md` §1.
  - Owner: ________  Verified on: ________

## Gate

Production may not be declared ready while any box in sections A–D is
unchecked. Section A must be complete before Section C, because a missing
`AUDIT_HASH_KEY` makes every audited production change fail by design.
