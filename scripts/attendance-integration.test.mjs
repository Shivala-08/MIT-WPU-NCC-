/**
 * The operational eligibility of the attendance against a real PostgreSQL.
 *
 * The suite proves the rules of the roll against the real database:
 *
 *   * a cadet that may take part in the attendance is on the roll;
 *   * a deactivated account is not on the roll any more;
 *   * a cadet whose roster row is inactive is not on the roll any more;
 *   * a cadet that is not approved is not on the roll;
 *   * a cadet that is not on the roll cannot be marked and cannot check in;
 *   * two check-ins of the same cadet at the same moment write exactly one
 *     attendance record.
 *
 * The suite uses the real transactions, the real foreign keys and the real
 * unique constraint of the pair of a session and a cadet.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAccount,
  createProfile,
  createRosterRow,
  fixturePrefix,
  openIntegrationDatabase,
  removeFixtures,
} from "./helpers/integration.mjs";

import {
  BASE_URL,
  loadSuiteContext,
  requireSecret,
  requireServer,
  sessionCookie,
} from "./helpers/db-suite.mjs";

import { eligibleCadetWhere } from "../src/lib/attendance-eligibility.mjs";

import {
  createSession,
  markAttendance,
  recordCheckIn,
} from "../src/lib/attendance-service.mjs";

const ADMIN = { id: null, role: "ADMIN", approvalStatus: "APPROVED" };

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
  const prefix = fixturePrefix("attendance");

  try {
    await run({ prisma, prefix });
  } finally {
    await removeFixtures(prisma, prefix).catch(() => undefined);
    await prisma.$disconnect();
  }

  return { skip: null };
}

/**
 * Builds the four accounts of a roll.
 *
 * @param {any} prisma
 * @param {string} prefix
 * @returns {Promise<{
 *   admin: any,
 *   eligible: any,
 *   deactivated: any,
 *   inactiveRoster: any,
 *   pending: any,
 * }>}
 */
async function buildRoll(prisma, prefix) {
  const admin = await createAccount(prisma, {
    email: `${prefix}-administrator@mitwpu.edu.in`,
    role: "ADMIN",
    approvalStatus: "APPROVED",
  });

  const eligibleRoster = await createRosterRow(prisma, {
    email: `${prefix}-eligible@mitwpu.edu.in`,
    fullName: "Eligible Cadet",
  });

  const eligible = await createAccount(prisma, {
    email: `${prefix}-eligible@mitwpu.edu.in`,
    approvalStatus: "APPROVED",
    rosterId: eligibleRoster.id,
  });

  await createProfile(prisma, eligible.id, { fullName: "Eligible Cadet" });

  const deactivatedRoster = await createRosterRow(prisma, {
    email: `${prefix}-deactivated@mitwpu.edu.in`,
    fullName: "Deactivated Cadet",
  });

  const deactivated = await createAccount(prisma, {
    email: `${prefix}-deactivated@mitwpu.edu.in`,
    approvalStatus: "APPROVED",
    rosterId: deactivatedRoster.id,
  });

  await createProfile(prisma, deactivated.id, {
    fullName: "Deactivated Cadet",
  });

  await prisma.user.update({
    where: { id: deactivated.id },
    data: { deactivatedAt: new Date(), deactivatedById: admin.id },
    select: { id: true },
  });

  const inactiveRoster = await createRosterRow(prisma, {
    email: `${prefix}-inactive-roster@mitwpu.edu.in`,
    fullName: "Inactive Roster Cadet",
    active: false,
  });

  const inactiveRosterCadet = await createAccount(prisma, {
    email: `${prefix}-inactive-roster@mitwpu.edu.in`,
    approvalStatus: "APPROVED",
    rosterId: inactiveRoster.id,
  });

  await createProfile(prisma, inactiveRosterCadet.id, {
    fullName: "Inactive Roster Cadet",
  });

  const pending = await createAccount(prisma, {
    email: `${prefix}-pending@mitwpu.edu.in`,
    approvalStatus: "PENDING",
  });

  await createProfile(prisma, pending.id, { fullName: "Pending Cadet" });

  return {
    admin,
    eligible,
    deactivated,
    inactiveRoster: inactiveRosterCadet,
    pending,
  };
}

/**
 * The cadets of the roll of the unit.
 *
 * @param {any} prisma
 * @returns {Promise<any[]>}
 */
async function roll(prisma) {
  return prisma.user.findMany({
    where: eligibleCadetWhere(),
    select: { id: true, email: true },
  });
}

test("the roll holds the eligible cadet and nobody else", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const accounts = await buildRoll(prisma, prefix);

    const cadets = await roll(prisma);
    const ids = cadets.map((cadet) => cadet.id);

    assert.ok(
      ids.includes(accounts.eligible.id),
      "the eligible cadet is on the roll"
    );
    assert.ok(
      !ids.includes(accounts.deactivated.id),
      "the deactivated account is not on the roll"
    );
    assert.ok(
      !ids.includes(accounts.inactiveRoster.id),
      "the cadet with an inactive roster row is not on the roll"
    );
    assert.ok(
      !ids.includes(accounts.pending.id),
      "the cadet that waits for the approval is not on the roll"
    );
    assert.ok(
      !ids.includes(accounts.admin.id),
      "an administrator is not a cadet of the roll"
    );
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("the roll route of the server holds the eligible cadet and nobody else", async (t) => {
  const context = loadSuiteContext();

  if (context.skip) {
    t.skip(context.skip);
    return;
  }

  requireSecret(context.secret);
  await requireServer(BASE_URL);

  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const accounts = await buildRoll(prisma, prefix);

    const cookie = await sessionCookie(context.secret, {
      id: accounts.admin.id,
      email: accounts.admin.email,
      name: "Fixture Administrator",
      role: "ADMIN",
    });

    const response = await fetch(`${BASE_URL}/api/admin/attendance/roll`, {
      headers: { cookie },
      redirect: "manual",
    });

    assert.equal(response.status, 200);

    const payload = await response.json();
    const ids = (payload.cadets ?? []).map((cadet) => cadet.id);

    assert.ok(
      ids.includes(accounts.eligible.id),
      "the eligible cadet is on the roll of the server"
    );
    assert.ok(
      !ids.includes(accounts.deactivated.id),
      "the deactivated account is not on the roll of the server"
    );
    assert.ok(
      !ids.includes(accounts.inactiveRoster.id),
      "the cadet with an inactive roster row is not on the roll of the server"
    );
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a cadet that is not on the roll cannot be marked", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const accounts = await buildRoll(prisma, prefix);

    const session = await createSession(
      prisma,
      {
        actor: { ...ADMIN, id: accounts.admin.id },
        input: {
          title: "Morning parade",
          activityType: "PARADE",
          date: "2026-11-04",
          startTime: "06:30",
          endTime: "09:30",
          venue: "Ground",
        },
        openImmediately: true,
      }
    );

    for (const cadet of [
      accounts.deactivated,
      accounts.inactiveRoster,
      accounts.pending,
    ]) {
      await assert.rejects(
        () =>
          markAttendance(prisma, {
            actor: { ...ADMIN, id: accounts.admin.id },
            sessionId: session.id,
            marks: [{ userId: cadet.id, status: "PRESENT" }],
          }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.deepEqual(error.invalidUserIds, [cadet.id]);
          return true;
        }
      );
    }

    // The eligible cadet is marked and exactly one record is written.
    const result = await markAttendance(prisma, {
      actor: { ...ADMIN, id: accounts.admin.id },
      sessionId: session.id,
      marks: [{ userId: accounts.eligible.id, status: "PRESENT" }],
    });

    assert.equal(result.created, 1);

    const records = await prisma.attendance.findMany({
      where: { sessionId: session.id },
      select: { userId: true },
    });

    assert.equal(records.length, 1);
    assert.equal(records[0].userId, accounts.eligible.id);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a cadet that is not on the roll cannot check in", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const accounts = await buildRoll(prisma, prefix);

    const session = await createSession(
      prisma,
      {
        actor: { ...ADMIN, id: accounts.admin.id },
        input: {
          title: "Evening drill",
          activityType: "DRILL",
          date: "2026-11-04",
          startTime: "16:00",
          endTime: "18:00",
          venue: "Ground",
        },
        openImmediately: true,
      }
    );

    const refused = [
      {
        cadet: accounts.deactivated,
        reason: /only an approved cadet can check in/i,
      },
      {
        cadet: accounts.inactiveRoster,
        reason: /roster row of this cadet is inactive/i,
      },
    ];

    for (const entry of refused) {
      await assert.rejects(
        () =>
          recordCheckIn(prisma, {
            actor: {
              id: entry.cadet.id,
              role: "CADET",
              approvalStatus: "APPROVED",
              deactivatedAt:
                entry.cadet === accounts.deactivated ? new Date() : null,
              rosterActive: entry.cadet !== accounts.inactiveRoster,
            },
            session,
            method: "QR",
          }),
        (error) => {
          assert.equal(error.statusCode, 403);
          assert.match(error.message, entry.reason);
          return true;
        }
      );
    }

    const records = await prisma.attendance.findMany({
      where: { sessionId: session.id },
      select: { id: true },
    });

    assert.equal(records.length, 0, "no record was written");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("the eligible cadet can check in", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const accounts = await buildRoll(prisma, prefix);

    const session = await createSession(
      prisma,
      {
        actor: { ...ADMIN, id: accounts.admin.id },
        input: {
          title: "Morning parade",
          activityType: "PARADE",
          date: "2026-11-04",
          startTime: "06:30",
          endTime: "09:30",
          venue: "Ground",
        },
        openImmediately: true,
      }
    );

    const result = await recordCheckIn(prisma, {
      actor: {
        id: accounts.eligible.id,
        role: "CADET",
        approvalStatus: "APPROVED",
        deactivatedAt: null,
        rosterActive: true,
      },
      session,
      method: "QR",
    });

    assert.equal(result.duplicate, false);
    assert.equal(result.record.status, "PRESENT");

    const records = await prisma.attendance.findMany({
      where: { sessionId: session.id, userId: accounts.eligible.id },
      select: { id: true },
    });

    assert.equal(records.length, 1);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("two check-ins at the same moment write exactly one record", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const accounts = await buildRoll(prisma, prefix);

    const session = await createSession(
      prisma,
      {
        actor: { ...ADMIN, id: accounts.admin.id },
        input: {
          title: "Morning parade",
          activityType: "PARADE",
          date: "2026-11-04",
          startTime: "06:30",
          endTime: "09:30",
          venue: "Ground",
        },
        openImmediately: true,
      }
    );

    const actor = {
      id: accounts.eligible.id,
      role: "CADET",
      approvalStatus: "APPROVED",
      deactivatedAt: null,
      rosterActive: true,
    };

    // Two clients send the check-in at the same moment. The unique
    // constraint of the pair of the session and the cadet decides the race.
    const results = await Promise.allSettled([
      recordCheckIn(prisma, { actor, session, method: "QR" }),
      recordCheckIn(prisma, { actor, session, method: "QR" }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    assert.equal(fulfilled.length, 2, "both requests are answered");
    assert.equal(rejected.length, 0, "neither request fails");

    const duplicates = fulfilled.filter(
      (result) => result.value.duplicate === true
    );

    assert.equal(
      duplicates.length,
      1,
      "the second request reports the check-in of the first one"
    );

    const records = await prisma.attendance.findMany({
      where: { sessionId: session.id, userId: accounts.eligible.id },
      select: { id: true },
    });

    assert.equal(records.length, 1, "exactly one attendance record exists");

    // The audit trail holds one check-in event.
    const events = await prisma.auditLog.findMany({
      where: {
        action: "ATTENDANCE_QR_CHECK_IN",
        entityId: records[0].id,
      },
      select: { id: true },
    });

    assert.equal(events.length, 1);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});
