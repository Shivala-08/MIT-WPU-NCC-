/**
 * The roster of the unit and the operational eligibility of a cadet against
 * a real PostgreSQL.
 *
 * The rules of the roster are proved here against the real database:
 *
 *   * an import writes the roster row, the link to the account, the profile
 *     and the audit event in one transaction;
 *   * a failing audit trail rolls the whole import back;
 *   * an inactive roster row blocks the attendance only. It never changes the
 *     approval state, it never deactivates the account and it never removes
 *     the profile, the attendance or the leave history;
 *   * a cadet with an inactive roster row may still submit a leave request.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAccount,
  createProfile,
  createRosterRow,
  fixturePrefix,
  openIntegrationDatabase,
  readAuditEvents,
  removeFixtures,
  withFailingAudit,
} from "./helpers/integration.mjs";

import {
  importRosterRows,
  setRosterActive,
} from "../src/lib/roster-service.mjs";

import { eligibleCadetWhere } from "../src/lib/attendance-eligibility.mjs";

/**
 * @param {(context: { prisma: any, prefix: string }) => Promise<void>} run
 * @returns {Promise<{ skip: string | null }>}
 */
async function withDatabase(run) {
  const opened = await openIntegrationDatabase();

  if (opened.skip) {
    return { skip: opened.skip };
  }

  const { prisma } = opened;
  const prefix = fixturePrefix("roster");

  try {
    await run({ prisma, prefix });
  } finally {
    await removeFixtures(prisma, prefix).catch(() => undefined);
    await prisma.$disconnect();
  }

  return { skip: null };
}

/**
 * @param {string} prefix
 * @param {string} suffix
 * @returns {{
 *   email: string,
 *   fullName: string,
 *   prn: string,
 *   regiNumber: string,
 *   wing: string,
 *   division: string,
 *   year: string,
 *   branch: string,
 * }}
 */
function rosterRow(prefix, suffix) {
  return {
    email: `${prefix}-${suffix}@mitwpu.edu.in`,
    fullName: `Cadet ${suffix}`,
    prn: `PRN${suffix.toUpperCase()}`,
    regiNumber: `REG${suffix.toUpperCase()}`,
    wing: "Army",
    division: "SD",
    year: "1st Year",
    branch: "Computer Science",
  };
}

test("an import writes the roster, the link, the profile and the audit event in one transaction", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const admin = await createAccount(prisma, {
      email: `${prefix}-administrator@mitwpu.edu.in`,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    });

    const row = rosterRow(prefix, "matched");
    const cadet = await createAccount(prisma, {
      email: row.email,
      approvalStatus: "PENDING",
    });

    const summary = await importRosterRows(prisma, {
      rows: [row],
      actorId: admin.id,
    });

    assert.equal(summary.imported, 1);
    assert.equal(summary.created, 1);
    assert.equal(summary.matched.length, 1);
    assert.equal(summary.unmatched.length, 0);

    const stored = await prisma.user.findUnique({
      where: { id: cadet.id },
      select: { rosterId: true, approvalStatus: true },
    });

    assert.ok(stored.rosterId, "the account is linked to the roster row");
    assert.equal(
      stored.approvalStatus,
      "PENDING",
      "the import never changes the approval state"
    );

    const profile = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: {
        id: true,
        fullName: true,
        wing: true,
        division: true,
        year: true,
        branch: true,
        prn: true,
        regiNumber: true,
      },
    });

    assert.ok(profile, "the import creates the profile of the cadet");
    assert.equal(profile.fullName, row.fullName);
    assert.equal(profile.wing, row.wing);
    assert.equal(profile.division, row.division);
    assert.equal(profile.year, row.year);
    assert.equal(profile.branch, row.branch);
    assert.equal(profile.prn, row.prn);

    // The roster and the profile are in the audit trail.
    const rosterEvents = await readAuditEvents(prisma, {
      action: "ROSTER_IMPORTED",
    });

    const imported = rosterEvents.find(
      (event) => event.newData?.imported === 1
    );

    assert.ok(imported, "the import is in the audit trail");
    assert.equal(imported.entity, "Roster");
    const profileEvents = await readAuditEvents(prisma, {
      action: "CADET_PROFILE_CREATED_FROM_ROSTER",
      entityId: profile.id,
    });

    assert.equal(profileEvents.length, 1);
    assert.equal(profileEvents[0].entity, "CadetProfile");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a failing audit trail rolls the whole import back", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const row = rosterRow(prefix, "rollback");
    const cadet = await createAccount(prisma, {
      email: row.email,
      approvalStatus: "PENDING",
    });

    const failing = withFailingAudit(prisma);

    await assert.rejects(
      () => importRosterRows(failing, { rows: [row] }),
      /audit trail refused the write/i
    );

    // The roster row was never written.
    const rosterRows = await prisma.roster.findMany({
      where: { email: row.email },
      select: { id: true },
    });

    assert.equal(rosterRows.length, 0, "the roster row was rolled back");

    // The account was not linked to a roster row.
    const stored = await prisma.user.findUnique({
      where: { id: cadet.id },
      select: { rosterId: true },
    });

    assert.equal(stored.rosterId, null);

    // The profile of the cadet was not created.
    const profile = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { id: true },
    });

    assert.equal(profile, null, "the profile was rolled back");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("an inactive roster row blocks the attendance only", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const admin = await createAccount(prisma, {
      email: `${prefix}-administrator@mitwpu.edu.in`,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    });

    const row = rosterRow(prefix, "inactive");
    const roster = await createRosterRow(prisma, row);

    const cadet = await createAccount(prisma, {
      email: row.email,
      approvalStatus: "APPROVED",
      rosterId: roster.id,
    });

    await createProfile(prisma, cadet.id, { fullName: row.fullName });

    // The cadet is on the roll while the roster row is active.
    const eligibleBefore = await prisma.user.findMany({
      where: eligibleCadetWhere({ id: cadet.id }),
      select: { id: true },
    });

    assert.equal(eligibleBefore.length, 1);

    const result = await setRosterActive(prisma, {
      rosterId: roster.id,
      active: false,
      actorId: admin.id,
    });

    assert.equal(result.active, false);

    // The cadet is not on the roll any more.
    const eligibleAfter = await prisma.user.findMany({
      where: eligibleCadetWhere({ id: cadet.id }),
      select: { id: true },
    });

    assert.equal(eligibleAfter.length, 0);

    // The approval state did not change and the account was not deactivated.
    const stored = await prisma.user.findUnique({
      where: { id: cadet.id },
      select: {
        approvalStatus: true,
        deactivatedAt: true,
        rosterId: true,
      },
    });

    assert.equal(stored.approvalStatus, "APPROVED");
    assert.equal(stored.deactivatedAt, null);
    assert.equal(stored.rosterId, roster.id);

    // The profile of the cadet is still there.
    const profile = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { id: true, fullName: true },
    });

    assert.ok(profile);
    assert.equal(profile.fullName, row.fullName);

    // The change of the row is in the audit trail.
    const events = await readAuditEvents(prisma, {
      action: "ROSTER_DEACTIVATED",
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].entity, "Roster");
    assert.equal(events[0].entityId, roster.id);
    assert.equal(events[0].oldData.active, true);
    assert.equal(events[0].newData.active, false);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a reactivation restores the eligibility and never changes the approval state", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const admin = await createAccount(prisma, {
      email: `${prefix}-administrator@mitwpu.edu.in`,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    });

    const row = rosterRow(prefix, "reactivate");
    const roster = await createRosterRow(prisma, { ...row, active: false });

    const cadet = await createAccount(prisma, {
      email: row.email,
      approvalStatus: "APPROVED",
      rosterId: roster.id,
    });

    await createProfile(prisma, cadet.id, { fullName: row.fullName });

    const before = await prisma.user.findMany({
      where: eligibleCadetWhere({ id: cadet.id }),
      select: { id: true },
    });

    assert.equal(before.length, 0);

    await setRosterActive(prisma, {
      rosterId: roster.id,
      active: true,
      actorId: admin.id,
    });

    const after = await prisma.user.findMany({
      where: eligibleCadetWhere({ id: cadet.id }),
      select: { id: true },
    });

    assert.equal(after.length, 1, "the cadet is on the roll again");

    const stored = await prisma.user.findUnique({
      where: { id: cadet.id },
      select: { approvalStatus: true, deactivatedAt: true },
    });

    assert.equal(stored.approvalStatus, "APPROVED");
    assert.equal(stored.deactivatedAt, null);

    const events = await readAuditEvents(prisma, {
      action: "ROSTER_ACTIVATED",
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].oldData.active, false);
    assert.equal(events[0].newData.active, true);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a cadet with an inactive roster row may still submit a leave request", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const { submitLeave } = await import("../src/lib/leave-service.mjs");

    const row = rosterRow(prefix, "leave");
    const roster = await createRosterRow(prisma, { ...row, active: false });

    const cadet = await createAccount(prisma, {
      email: row.email,
      approvalStatus: "APPROVED",
      rosterId: roster.id,
    });

    await createProfile(prisma, cadet.id, { fullName: row.fullName });

    const leave = await submitLeave(prisma, {
      actor: { id: cadet.id, role: "CADET" },
      input: {
        type: "MEDICAL",
        reason: "The cadet has a medical appointment in the campus clinic.",
        startDate: "2026-11-10",
        endDate: "2026-11-11",
      },
    });

    assert.ok(leave.id, "the leave request was stored");
    assert.equal(leave.userId, cadet.id);
    assert.equal(leave.status, "PENDING");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a failing audit trail rolls the deactivation of a roster row back", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const admin = await createAccount(prisma, {
      email: `${prefix}-administrator@mitwpu.edu.in`,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    });

    const roster = await createRosterRow(prisma, rosterRow(prefix, "audit"));

    const failing = withFailingAudit(prisma);

    await assert.rejects(
      () =>
        setRosterActive(failing, {
          rosterId: roster.id,
          active: false,
          actorId: admin.id,
        }),
      /audit trail refused the write/i
    );

    const stored = await prisma.roster.findUnique({
      where: { id: roster.id },
      select: { active: true },
    });

    assert.equal(stored.active, true, "the row was rolled back");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});
