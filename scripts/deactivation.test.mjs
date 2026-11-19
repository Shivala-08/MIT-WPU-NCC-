import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASE_URL,
  createPrismaClient,
  loadSuiteContext,
  requireColumn,
  requireDatabase,
  requireSecret,
  requireServer,
  sessionCookie,
} from "./helpers/db-suite.mjs";
import { USER_OMIT } from "../src/lib/user-fields.mjs";

/**
 * The deactivation of an account against a real PostgreSQL.
 *
 * The service tests use the real database, so the transaction and the
 * foreign keys behave like they behave in production. The API tests use the
 * development server and a real session cookie.
 *
 * The suite needs the migration `20261101090000_account_deactivation` to be
 * applied to the local database. Without the column the suite fails and says
 * why: a skipped suite would report a green result while it proved nothing.
 */

async function withFixtures(run) {
  const context = loadSuiteContext();

  if (context.skip) {
    return { skip: context.skip };
  }

  // The suite runs against the local development environment. A missing
  // secret, a server that does not answer, a database that does not answer
  // and an unapplied migration are failures and not skips.
  requireSecret(context.secret);
  await requireServer(BASE_URL);

  const prisma = await createPrismaClient(context.env);

  try {
    await requireDatabase(prisma);
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    throw error;
  }

  await requireColumn(
    prisma,
    "User",
    "deactivatedAt",
    "20261101090000_account_deactivation"
  );

  const { deactivateAccount } = await import("../src/lib/account-service.mjs");

  const stamp = Date.now();
  const emails = {
    admin: `deactivation-admin-${stamp}@mitwpu.edu.in`,
    secondAdmin: `deactivation-second-${stamp}@mitwpu.edu.in`,
    cadet: `deactivation-cadet-${stamp}@mitwpu.edu.in`,
  };

  const create = (email, role) =>
    prisma.user.create({
      data: {
        name: `Fixture ${email}`,
        email,
        password: null,
        role,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
      },
      select: { id: true, email: true, role: true, approvalStatus: true },
    });

  const fixtures = {};

  // The identifiers are declared outside of the try block so that the cleanup
  // in the finally block can reach them when the setup fails half way through.
  let session = null;
  let attendance = null;
  let leave = null;

  try {
    fixtures.admin = await create(emails.admin, "ADMIN");
    fixtures.secondAdmin = await create(emails.secondAdmin, "ADMIN");
    fixtures.cadet = await create(emails.cadet, "CADET");

    await prisma.cadetProfile.create({
      data: { userId: fixtures.cadet.id, fullName: "Deactivation Cadet" },
    });

    session = await prisma.attendanceSession.create({
      data: {
        title: "Deactivation parade",
        type: "PARADE",
        date: new Date("2024-01-05T06:30:00.000Z"),
        status: "CLOSED",
      },
      select: { id: true },
    });

    const attendanceRow = await prisma.attendance.create({
      data: {
        userId: fixtures.cadet.id,
        sessionId: session.id,
        status: "PRESENT",
        method: "MANUAL",
        markedAt: new Date("2024-01-05T06:30:00.000Z"),
        createdAt: new Date("2024-01-05T06:30:00.000Z"),
      },
      select: { id: true },
    });
    attendance = attendanceRow;

    const leaveRow = await prisma.leaveRequest.create({
      data: {
        userId: fixtures.cadet.id,
        type: "MEDICAL",
        reason: "A fixture leave request of the history",
        startDate: new Date("2024-02-01T00:00:00.000Z"),
        endDate: new Date("2024-02-02T00:00:00.000Z"),
        status: "APPROVED",
      },
      select: { id: true },
    });
    leave = leaveRow;

    await prisma.auditLog.create({
      data: {
        userId: fixtures.admin.id,
        action: "ATTENDANCE_MARKED",
        entity: "Attendance",
        entityId: attendanceRow.id,
      },
      select: { id: true },
    });

    const cookieFor = async (user) =>
      sessionCookie(context.secret, user);

    const request = (path, { method = "GET", body, cookie } = {}) =>
      fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
      });

    const result = await run({
      prisma,
      fixtures,
      emails,
      deactivateAccount,
      session,
      attendance,
      leave,
      cookieFor,
      get: (path, cookie) => request(path, { cookie }),
      post: (path, body, cookie) => request(path, { method: "POST", body, cookie }),
      patch: (path, body, cookie) => request(path, { method: "PATCH", body, cookie }),
      delete: (path, cookie) => request(path, { method: "DELETE", cookie }),
    });

    return { skip: null, result };
  } finally {
    // The cleanup is ordered so that the foreign keys of the schema are
    // respected: the rows that point at a user go first, the profile of a
    // cadet goes before the account, the account goes last.
    //
    // The accounts are collected by their prefix and not only from the
    // fixtures of this run, so that a row of an earlier run that was left
    // behind cannot block the cleanup.
    const accounts = await prisma.user.findMany({
      where: { email: { contains: "deactivation-" } },
      select: { id: true },
    });
    const fixtureUserIds = accounts.map((account) => account.id);
    const entityIds = [attendance?.id, leave?.id, session?.id].filter(Boolean);

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: entityIds } },
          { userId: { in: fixtureUserIds } },
        ],
      },
    });
    await prisma.leaveRequest.deleteMany({
      where: { userId: { in: fixtureUserIds } },
    });
    await prisma.attendance.deleteMany({
      where: { userId: { in: fixtureUserIds } },
    });
    await prisma.attendanceManualCode.deleteMany({
      where: { sessionId: { in: entityIds } },
    });
    await prisma.attendanceQrToken.deleteMany({
      where: { sessionId: { in: entityIds } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { id: { in: entityIds } },
    });
    await prisma.cadetProfile.deleteMany({
      where: { userId: { in: fixtureUserIds } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: "deactivation-" } },
    });
    await prisma.$disconnect();
  }
}

test("a deactivated cadet keeps its attendance, its leave requests and its profile", async (t) => {
  const outcome = await withFixtures(
    async ({ prisma, fixtures, deactivateAccount, attendance, leave }) => {
      const result = await deactivateAccount(prisma, {
        targetUserId: fixtures.cadet.id,
        actorId: fixtures.admin.id,
        reason: "The cadet left the unit.",
      });

      const account = await prisma.user.findUnique({
        where: { id: fixtures.cadet.id },
        omit: USER_OMIT,
      });
      const keptAttendance = await prisma.attendance.findUnique({
        where: { id: attendance.id },
      });
      const keptLeave = await prisma.leaveRequest.findUnique({
        where: { id: leave.id },
      });
      const profile = await prisma.cadetProfile.findUnique({
        where: { userId: fixtures.cadet.id },
      });

      return {
        result,
        account,
        keptAttendance,
        keptLeave,
        profile,
        actorId: fixtures.admin.id,
        cadetId: fixtures.cadet.id,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const {
    result,
    account,
    keptAttendance,
    keptLeave,
    profile,
    actorId,
    cadetId,
  } = outcome.result;

  assert.equal(result.alreadyDeactivated, false);
  assert.ok(account, "the account row must be kept");
  assert.ok(account.deactivatedAt instanceof Date);
  assert.equal(account.deactivatedById, actorId);

  // The history and the relationship to the original account are kept.
  assert.ok(keptAttendance);
  assert.equal(keptAttendance.userId, cadetId);
  assert.equal(keptAttendance.status, "PRESENT");
  assert.ok(keptLeave);
  assert.equal(keptLeave.userId, cadetId);
  assert.ok(profile);
  assert.equal(profile.userId, cadetId);
});

test("the deactivation and its audit event are written in one transaction", async (t) => {
  const outcome = await withFixtures(
    async ({ prisma, fixtures, deactivateAccount }) => {
      await deactivateAccount(prisma, {
        targetUserId: fixtures.cadet.id,
        actorId: fixtures.admin.id,
        reason: "The cadet left the unit.",
      });

      const events = await prisma.auditLog.findMany({
        where: {
          entity: "User",
          entityId: fixtures.cadet.id,
          action: "ACCOUNT_DEACTIVATED",
        },
      });

      return { events, actorId: fixtures.admin.id };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const { events, actorId } = outcome.result;

  assert.equal(events.length, 1);
  assert.equal(events[0].userId, actorId);
  assert.equal(events[0].oldData.deactivatedAt, null);
  assert.ok(events[0].newData.deactivatedAt);
});

test("an administrator can deactivate a cadet through the API", async (t) => {
  const outcome = await withFixtures(async ({ fixtures, cookieFor, delete: del }) => {
    const adminCookie = await cookieFor(fixtures.admin);

    const response = await del(
      `/api/admin/cadets?userId=${fixtures.cadet.id}&reason=${encodeURIComponent(
        "The cadet left the unit."
      )}`,
      adminCookie
    );

    const payload = await response.json().catch(() => ({}));

    return { status: response.status, payload };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const { status, payload } = outcome.result;

  assert.equal(status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.alreadyDeactivated, false);
  assert.match(payload.message, /attendance history/i);
});

test("an already deactivated account is reported in a consistent way", async (t) => {
  const outcome = await withFixtures(async ({ fixtures, cookieFor, delete: del }) => {
    const adminCookie = await cookieFor(fixtures.admin);

    const first = await del(
      `/api/admin/cadets?userId=${fixtures.cadet.id}`,
      adminCookie
    );
    const firstPayload = await first.json().catch(() => ({}));

    const second = await del(
      `/api/admin/cadets?userId=${fixtures.cadet.id}`,
      adminCookie
    );
    const secondPayload = await second.json().catch(() => ({}));

    return {
      firstStatus: first.status,
      firstPayload,
      secondStatus: second.status,
      secondPayload,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const { firstStatus, firstPayload, secondStatus, secondPayload } = outcome.result;

  assert.equal(firstStatus, 200);
  assert.equal(firstPayload.alreadyDeactivated, false);
  assert.equal(secondStatus, 200);
  assert.equal(secondPayload.alreadyDeactivated, true);
  assert.match(secondPayload.message, /already deactivated/i);
});

test("an administrator cannot deactivate their own account", async (t) => {
  const outcome = await withFixtures(async ({ fixtures, cookieFor, delete: del }) => {
    const adminCookie = await cookieFor(fixtures.admin);

    const response = await del(
      `/api/admin/cadets?userId=${fixtures.admin.id}`,
      adminCookie
    );
    const payload = await response.json().catch(() => ({}));

    return { status: response.status, payload };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const { status, payload } = outcome.result;

  assert.equal(status, 409);
  assert.match(payload.error, /own account/i);
});

test("a failed deactivation answers with a message the administrator can read", async (t) => {
  const outcome = await withFixtures(async ({ fixtures, cookieFor, delete: del }) => {
    const adminCookie = await cookieFor(fixtures.admin);

    const response = await del(
      "/api/admin/cadets?userId=does-not-exist",
      adminCookie
    );
    const payload = await response.json().catch(() => ({}));

    return { status: response.status, payload };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const { status, payload } = outcome.result;

  assert.equal(status, 404);
  assert.equal(typeof payload.error, "string");
  assert.ok(payload.error.length > 0);
  // The internals of the database are never exposed.
  assert.equal(JSON.stringify(payload).includes("prisma"), false);
  assert.equal(JSON.stringify(payload).includes("P20"), false);
});

test("a deactivated cadet cannot check in and cannot use the cadet API", async (t) => {
  const outcome = await withFixtures(
    async ({ fixtures, cookieFor, delete: del, post, get }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const cadetCookie = await cookieFor(fixtures.cadet);

      await del(`/api/admin/cadets?userId=${fixtures.cadet.id}`, adminCookie);

      const checkIn = await post("/api/attendance/check-in", {}, cadetCookie);
      const summary = await get("/api/attendance/summary", cadetCookie);
      const dashboard = await get("/dashboard", cadetCookie);
      const attendancePage = await get("/attendance", cadetCookie);

      return {
        checkIn: checkIn.status,
        checkInBody: await checkIn.json().catch(() => ({})),
        summary: summary.status,
        summaryBody: await summary.json().catch(() => ({})),
        dashboard: dashboard.status,
        dashboardLocation: dashboard.headers.get("location"),
        attendancePage: attendancePage.status,
        attendanceLocation: attendancePage.headers.get("location"),
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;

  // The API of the cadet is closed for a deactivated account.
  assert.equal(result.checkIn, 403);
  assert.equal(result.checkInBody.code, "DEACTIVATED");
  assert.equal(result.summary, 403);
  assert.equal(result.summaryBody.code, "DEACTIVATED");

  // The pages of the cadet send the account to the status page.
  assert.equal(result.dashboard, 307);
  assert.equal(result.dashboardLocation, "/pending");
  assert.equal(result.attendancePage, 307);
  assert.equal(result.attendanceLocation, "/pending");
});

test("a deactivated account is not counted as an active administrator", async (t) => {
  const outcome = await withFixtures(
    async ({ prisma, fixtures, deactivateAccount }) => {
      const before = await prisma.user.count({
        where: { role: "ADMIN", deactivatedAt: null },
      });

      await deactivateAccount(prisma, {
        targetUserId: fixtures.secondAdmin.id,
        actorId: fixtures.admin.id,
      });

      const after = await prisma.user.count({
        where: { role: "ADMIN", deactivatedAt: null },
      });

      return { before, after };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const { before, after } = outcome.result;

  assert.equal(after, before - 1);
});

test("a reactivation through the API lifts the deactivation", async (t) => {
  const outcome = await withFixtures(
    async ({ prisma, fixtures, cookieFor, delete: del, patch, get }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const cadetCookie = await cookieFor(fixtures.cadet);

      await del(`/api/admin/cadets?userId=${fixtures.cadet.id}`, adminCookie);

      const blocked = await get("/api/attendance/summary", cadetCookie);

      const response = await patch(
        "/api/admin/cadets",
        { userId: fixtures.cadet.id, deactivated: false },
        adminCookie
      );
      const payload = await response.json().catch(() => ({}));

      const allowed = await get("/api/attendance/summary", cadetCookie);

      const account = await prisma.user.findUnique({
        where: { id: fixtures.cadet.id },
        omit: USER_OMIT,
      });

      return {
        blocked: blocked.status,
        response: response.status,
        payload,
        allowed: allowed.status,
        deactivatedAt: account?.deactivatedAt ?? null,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;

  assert.equal(result.blocked, 403);
  assert.equal(result.response, 200);
  assert.equal(result.payload.success, true);
  assert.equal(result.deactivatedAt, null);
  assert.notEqual(result.allowed, 403);
});

test("the server has to be reachable for the API tests", async (t) => {
  const context = loadSuiteContext();

  if (context.skip) {
    t.skip(context.skip);
    return;
  }

  // The server is a prerequisite of the suite. When it does not answer the
  // suite fails, because a skipped suite would report a green result while
  // it proved nothing.
  await requireServer(BASE_URL);

  t.diagnostic(`the development server is reachable at ${BASE_URL}`);
});
