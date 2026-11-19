/**
 * The approval lifecycle against a real PostgreSQL.
 *
 * The suite runs the service against the local development database, so the
 * transactions, the foreign keys and the trigger of the profile really run.
 *
 * The column of the origin of the decision is added by the migration
 * `20261105000000_approval_decision_source`. The application works before and
 * after that migration, so the suite asserts the contract of the window it
 * runs in and reports which window it was.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAccount,
  createProfile,
  createRosterRow,
  decisionSourceColumnPresent,
  fixturePrefix,
  openIntegrationDatabase,
  readAuditEvents,
  removeFixtures,
  withFailingAccountCreate,
  withFailingAudit,
} from "./helpers/integration.mjs";

import {
  resolveGoogleAccount,
  setApprovalStatus,
} from "../src/lib/account-service.mjs";

const DOMAINS = "mitwpu.edu.in";

/**
 * Runs a test against the local development database.
 *
 * @param {(context: { prisma: any, prefix: string, decisionSourceColumn: boolean }) => Promise<void>} run
 * @returns {Promise<void>}
 */
async function withDatabase(run) {
  const opened = await openIntegrationDatabase();

  if (opened.skip) {
    return { skip: opened.skip };
  }

  const { prisma } = opened;
  const prefix = fixturePrefix("approval");
  const decisionSourceColumn = await decisionSourceColumnPresent(prisma);

  try {
    await run({ prisma, prefix, decisionSourceColumn });
  } finally {
    await removeFixtures(prisma, prefix).catch(() => undefined);
    await prisma.$disconnect();
  }

  return { skip: null };
}

test("a cadet on the roster is approved automatically at the first sign in", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix, decisionSourceColumn }) => {
    const email = `${prefix}-auto@mitwpu.edu.in`;
    const roster = await createRosterRow(prisma, {
      email,
      fullName: "Automatic Cadet",
    });

    const result = await resolveGoogleAccount(prisma, {
      email,
      emailVerified: true,
      name: "Automatic Cadet",
      allowedEmailDomains: DOMAINS,
    });

    assert.equal(result.ok, true);
    assert.equal(result.user.approvalStatus, "APPROVED");
    assert.equal(result.autoApproved, true);
    assert.equal(result.source, "AUTOMATIC");
    assert.equal(result.user.rosterId, roster.id);

    const stored = await prisma.user.findUnique({
      where: { id: result.user.id },
      select: {
        approvalStatus: true,
        approvedById: true,
        rosterId: true,
        emailVerifiedAt: true,
      },
    });

    assert.equal(stored.approvalStatus, "APPROVED");
    assert.equal(stored.approvedById, null);
    assert.equal(stored.rosterId, roster.id);
    assert.ok(stored.emailVerifiedAt);

    // The account and its audit event are written in one transaction.
    const events = await readAuditEvents(prisma, {
      entity: "User",
      entityId: result.user.id,
    });

    const created = events.find(
      (event) => event.action === "ACCOUNT_CREATED_ROSTER_APPROVED"
    );

    assert.ok(created, "the automatic approval is in the audit trail");
    assert.equal(created.newData.approvalStatus, "APPROVED");
    assert.equal(created.newData.decisionSource, "AUTOMATIC");

    // The profile of the cadet exists and carries the roster fields.
    const profile = await prisma.cadetProfile.findUnique({
      where: { userId: result.user.id },
      select: {
        fullName: true,
        wing: true,
        division: true,
        year: true,
        branch: true,
        status: true,
      },
    });

    assert.ok(profile, "the account always has a profile");
    assert.equal(profile.fullName, "Automatic Cadet");
    assert.equal(profile.wing, "Army");
    assert.equal(profile.status, "APPROVED");

    if (decisionSourceColumn) {
      const withSource = await prisma.user.findUnique({
        where: { id: result.user.id },
        select: { approvalDecisionSource: true },
      });

      assert.equal(withSource.approvalDecisionSource, "AUTOMATIC");
    }
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a decision of an administrator is never replaced by the automatic path", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix, decisionSourceColumn }) => {
    const email = `${prefix}-admin@mitwpu.edu.in`;
    const roster = await createRosterRow(prisma, { email });

    const admin = await createAccount(prisma, {
      email: `${prefix}-administrator@mitwpu.edu.in`,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    });

    const cadet = await createAccount(prisma, {
      email,
      approvalStatus: "PENDING",
      rosterId: roster.id,
    });

    await createProfile(prisma, cadet.id);

    // The administrator puts the account back into PENDING. The decision is
    // the decision of the administrator and it is authoritative.
    await setApprovalStatus(prisma, {
      targetUserId: cadet.id,
      status: "PENDING",
      actorId: admin.id,
    });

    // The roster matches the account. The automatic path must not approve it.
    const result = await resolveGoogleAccount(prisma, {
      email,
      emailVerified: true,
      name: "Admin Pending Cadet",
      allowedEmailDomains: DOMAINS,
    });

    assert.equal(result.ok, true);
    assert.equal(result.user.approvalStatus, "PENDING");
    assert.equal(result.autoApproved, false);
    assert.equal(result.source, "ADMINISTRATOR");

    const stored = await prisma.user.findUnique({
      where: { id: cadet.id },
      select: { approvalStatus: true, approvedById: true },
    });

    assert.equal(stored.approvalStatus, "PENDING");
    assert.equal(stored.approvedById, admin.id);

    if (decisionSourceColumn) {
      const withSource = await prisma.user.findUnique({
        where: { id: cadet.id },
        select: { approvalDecisionSource: true },
      });

      assert.equal(withSource.approvalDecisionSource, "ADMINISTRATOR");
    }

    // The decision of the administrator is in the audit trail.
    const events = await readAuditEvents(prisma, {
      entity: "User",
      entityId: cadet.id,
    });

    const decision = events.find((event) => event.action === "ACCOUNT_PENDING");

    assert.ok(decision, "the decision of the administrator is in the trail");
    assert.equal(decision.oldData.approvalStatus, "PENDING");
    assert.equal(decision.newData.approvalStatus, "PENDING");
    assert.equal(decision.newData.decisionSource, "ADMINISTRATOR");

    // The automatic approval never happened.
    const automatic = events.find(
      (event) => event.action === "ACCOUNT_APPROVED_FROM_ROSTER"
    );

    assert.equal(automatic, undefined);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a rejected account is never approved by the roster", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const email = `${prefix}-rejected@mitwpu.edu.in`;
    const roster = await createRosterRow(prisma, { email });

    const admin = await createAccount(prisma, {
      email: `${prefix}-administrator@mitwpu.edu.in`,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    });

    const cadet = await createAccount(prisma, {
      email,
      approvalStatus: "PENDING",
      rosterId: roster.id,
    });

    await createProfile(prisma, cadet.id);

    await setApprovalStatus(prisma, {
      targetUserId: cadet.id,
      status: "REJECTED",
      actorId: admin.id,
      rejectionReason: "The documents of the cadet are not complete.",
    });

    const result = await resolveGoogleAccount(prisma, {
      email,
      emailVerified: true,
      allowedEmailDomains: DOMAINS,
    });

    assert.equal(result.ok, true);
    assert.equal(result.user.approvalStatus, "REJECTED");
    assert.equal(result.autoApproved, false);

    const stored = await prisma.user.findUnique({
      where: { id: cadet.id },
      select: { approvalStatus: true, rejectionReason: true },
    });

    assert.equal(stored.approvalStatus, "REJECTED");
    assert.equal(
      stored.rejectionReason,
      "The documents of the cadet are not complete."
    );
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("an inactive roster row never approves an account", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const email = `${prefix}-inactive@mitwpu.edu.in`;
    const roster = await createRosterRow(prisma, { email, active: false });

    const result = await resolveGoogleAccount(prisma, {
      email,
      emailVerified: true,
      allowedEmailDomains: DOMAINS,
    });

    assert.equal(result.ok, true);
    assert.equal(result.user.approvalStatus, "PENDING");
    assert.equal(result.autoApproved, false);
    assert.equal(result.source, "NONE");

    const stored = await prisma.user.findUnique({
      where: { id: result.user.id },
      select: { approvalStatus: true, rosterId: true },
    });

    assert.equal(stored.approvalStatus, "PENDING");
    assert.equal(stored.rosterId, roster.id);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a deactivated account never signs in again and is never reactivated by the roster", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const email = `${prefix}-deactivated@mitwpu.edu.in`;
    await createRosterRow(prisma, { email });

    const admin = await createAccount(prisma, {
      email: `${prefix}-administrator@mitwpu.edu.in`,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    });

    const cadet = await createAccount(prisma, {
      email,
      approvalStatus: "APPROVED",
    });

    await createProfile(prisma, cadet.id);

    await prisma.user.update({
      where: { id: cadet.id },
      data: {
        deactivatedAt: new Date(),
        deactivatedById: admin.id,
        deactivationReason: "The cadet left the unit.",
      },
      select: { id: true },
    });

    const result = await resolveGoogleAccount(prisma, {
      email,
      emailVerified: true,
      allowedEmailDomains: DOMAINS,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "ACCOUNT_DEACTIVATED");

    const stored = await prisma.user.findUnique({
      where: { id: cadet.id },
      select: { approvalStatus: true, deactivatedAt: true },
    });

    assert.equal(stored.approvalStatus, "APPROVED");
    assert.ok(stored.deactivatedAt);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a failing audit trail rolls the decision of the administrator back", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const email = `${prefix}-rollback@mitwpu.edu.in`;

    const admin = await createAccount(prisma, {
      email: `${prefix}-administrator@mitwpu.edu.in`,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    });

    const cadet = await createAccount(prisma, {
      email,
      approvalStatus: "PENDING",
    });

    await createProfile(prisma, cadet.id);

    const failing = withFailingAudit(prisma);

    await assert.rejects(
      () =>
        setApprovalStatus(failing, {
          targetUserId: cadet.id,
          status: "APPROVED",
          actorId: admin.id,
        }),
      /audit trail refused the write/i
    );

    // The transaction rolled the decision back. The account still waits.
    const stored = await prisma.user.findUnique({
      where: { id: cadet.id },
      select: {
        approvalStatus: true,
        approvedById: true,
        approvedAt: true,
      },
    });

    assert.equal(stored.approvalStatus, "PENDING");
    assert.equal(stored.approvedById, null);
    assert.equal(stored.approvedAt, null);

    // The mirror of the profile still follows the state of the account.
    const profile = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { status: true },
    });

    assert.equal(profile.status, "PENDING");

    // No audit event was written for the rolled back decision.
    const events = await readAuditEvents(prisma, {
      entity: "User",
      entityId: cadet.id,
    });

    assert.equal(events.length, 0);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a failing account write leaves no account and no orphan event behind", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const email = `${prefix}-no-account@mitwpu.edu.in`;
    await createRosterRow(prisma, { email });

    const failing = withFailingAccountCreate(prisma);

    await assert.rejects(
      () =>
        resolveGoogleAccount(failing, {
          email,
          emailVerified: true,
          allowedEmailDomains: DOMAINS,
        }),
      /account creation failed/i
    );

    const accounts = await prisma.user.findMany({
      where: { email },
      select: { id: true },
    });

    assert.equal(accounts.length, 0, "the account was never created");

    // The trail of the unit must not carry an event for the account that was
    // never created.
    const fixtureAccounts = await prisma.user.findMany({
      where: { email: { contains: prefix } },
      select: { id: true },
    });

    const events = await readAuditEvents(prisma, {
      entity: "User",
      entityId: fixtureAccounts.map((account) => account.id),
    });

    assert.equal(events.length, 0, "the audit trail has no orphan event");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});
