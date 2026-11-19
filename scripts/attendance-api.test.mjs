import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASE_URL,
  createPrismaClient,
  loadSuiteContext,
  requireDatabase,
  requireSecret,
  requireServer,
  sessionCookie,
} from "./helpers/db-suite.mjs";

// The server checks the current time against the window of the session before
// it accepts a check-in. A test that checks in therefore needs a session for
// today in the timezone of the unit (+05:30), not a fixed future date.
const SESSION_TIME_ZONE_OFFSET_MINUTES = 330;

function todayInSessionTimeZone() {
  const shifted = new Date(
    Date.now() + SESSION_TIME_ZONE_OFFSET_MINUTES * 60_000
  );

  return shifted.toISOString().slice(0, 10);
}

async function withFixtures(run) {
  const context = loadSuiteContext();

  if (context.skip) {
    return { skip: context.skip };
  }

  // The suite runs against the local development environment. A missing
  // secret, a server that does not answer and a database that does not
  // answer are failures and not skips.
  requireSecret(context.secret);
  await requireServer(BASE_URL);

  const prisma = await createPrismaClient(context.env);

  try {
    await requireDatabase(prisma);
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    throw error;
  }

  const stamp = Date.now();
  const emails = {
    admin: `phase3-admin-${stamp}@mitwpu.edu.in`,
    officer: `phase3-officer-${stamp}@mitwpu.edu.in`,
    cadet: `phase3-cadet-${stamp}@mitwpu.edu.in`,
    other: `phase3-other-${stamp}@mitwpu.edu.in`,
    pending: `phase3-pending-${stamp}@mitwpu.edu.in`,
  };

  const create = (email, role, approvalStatus) =>
    prisma.user.create({
      data: {
        name: `Fixture ${email}`,
        email,
        password: null,
        role,
        approvalStatus,
        approvedAt: approvalStatus === "APPROVED" ? new Date() : null,
      },
      select: { id: true, email: true, role: true, approvalStatus: true },
    });

  const fixtures = {};

  try {
    fixtures.admin = await create(emails.admin, "ADMIN", "APPROVED");
    fixtures.officer = await create(emails.officer, "OFFICER", "APPROVED");
    fixtures.cadet = await create(emails.cadet, "CADET", "APPROVED");
    fixtures.other = await create(emails.other, "CADET", "APPROVED");
    fixtures.pending = await create(emails.pending, "CADET", "PENDING");

    const cookieFor = async (user, roleOverride) =>
      sessionCookie(context.secret, user, roleOverride);

    const request = (path, cookie, init = {}) =>
      fetch(`${BASE_URL}${path}`, {
        redirect: "manual",
        ...init,
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
          ...(init.headers ?? {}),
        },
      });

    const result = await run({
      prisma,
      fixtures,
      emails,
      cookieFor,
      get: (path, cookie) => request(path, cookie),
      post: (path, body, cookie) =>
        request(path, cookie, { method: "POST", body: JSON.stringify(body) }),
      patch: (path, body, cookie) =>
        request(path, cookie, { method: "PATCH", body: JSON.stringify(body) }),
      delete: (path, cookie) => request(path, cookie, { method: "DELETE" }),
    });

    return { skip: null, result };
  } finally {
    await prisma.attendanceQrToken.deleteMany({
      where: { session: { title: { startsWith: "Phase 3" } } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { title: { startsWith: "Phase 3" } },
    });
    await prisma.leaveRequest.deleteMany({
      where: { user: { email: { contains: "phase3-" } } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        userId: {
          in: Object.values(fixtures).map((fixture) => fixture.id),
        },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: "phase3-" } },
    });
    await prisma.$disconnect();
  }
}

test("an anonymous caller cannot reach the attendance and leave APIs", async (t) => {
  const outcome = await withFixtures(async ({ get, post }) => {
    const sessions = await get("/api/admin/attendance/sessions");
    const checkIn = await post("/api/attendance/check-in", { token: "x".repeat(40) });
    const leave = await get("/api/leave");
    const summary = await get("/api/attendance/summary");

    return {
      sessions: sessions.status,
      checkIn: checkIn.status,
      leave: leave.status,
      summary: summary.status,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.sessions, 401);
  assert.equal(outcome.result.checkIn, 401);
  assert.equal(outcome.result.leave, 401);
  assert.equal(outcome.result.summary, 401);
});

test("a cadet cannot manage the sessions of the unit", async (t) => {
  const outcome = await withFixtures(async ({ get, post, cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.cadet);

    const list = await get("/api/admin/attendance/sessions", cookie);
    const create = await post(
      "/api/admin/attendance/sessions",
      {
        title: "Phase 3 cadet session",
        activityType: "PARADE",
        date: "2026-11-02",
      },
      cookie
    );
    const reports = await get("/api/admin/attendance/reports", cookie);
    const exportCsv = await get("/api/admin/attendance/export", cookie);
    const leaveQueue = await get("/api/admin/leave", cookie);

    return {
      list: list.status,
      create: create.status,
      reports: reports.status,
      exportCsv: exportCsv.status,
      leaveQueue: leaveQueue.status,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.list, 403);
  assert.equal(outcome.result.create, 403);
  assert.equal(outcome.result.reports, 403);
  assert.equal(outcome.result.exportCsv, 403);
  assert.equal(outcome.result.leaveQueue, 403);
});

test("an admin creates a session and an invalid session is refused", async (t) => {
  const outcome = await withFixtures(async ({ post, cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.admin);

    const created = await post(
      "/api/admin/attendance/sessions",
      {
        title: "Phase 3 morning parade",
        activityType: "Parade",
        date: "2026-11-02",
        startTime: "06:30",
        endTime: "09:30",
        venue: "Main ground",
      },
      cookie
    );

    const invalid = await post(
      "/api/admin/attendance/sessions",
      {
        title: "Phase 3 broken session",
        activityType: "PARADE",
        date: "02-11-2026",
      },
      cookie
    );

    const invalidType = await post(
      "/api/admin/attendance/sessions",
      {
        title: "Phase 3 picnic",
        activityType: "PICNIC",
        date: "2026-11-02",
      },
      cookie
    );

    const payload = await created.json();

    return {
      created: created.status,
      status: payload.session?.status,
      invalid: invalid.status,
      invalidType: invalidType.status,
      sessionId: payload.session?.id,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.created, 201);
  assert.equal(outcome.result.status, "DRAFT");
  assert.equal(outcome.result.invalid, 400);
  assert.equal(outcome.result.invalidType, 400);
});

test("an officer opens the session and marks an approved cadet", async (t) => {
  const outcome = await withFixtures(
    async ({ post, cookieFor, fixtures }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const officerCookie = await cookieFor(fixtures.officer);

      const created = await post(
        "/api/admin/attendance/sessions",
        {
          title: "Phase 3 marking session",
          activityType: "PARADE",
          date: "2026-11-02",
          startTime: "06:30",
          endTime: "09:30",
        },
        adminCookie
      );

      const payload = await created.json();
      const sessionId = payload.session.id;

      const markedWhileDraft = await post(
        `/api/admin/attendance/sessions/${sessionId}/records`,
        { marks: [{ userId: fixtures.cadet.id, status: "PRESENT" }] },
        officerCookie
      );

      const opened = await post(
        `/api/admin/attendance/sessions/${sessionId}/open`,
        {},
        officerCookie
      );

      const marked = await post(
        `/api/admin/attendance/sessions/${sessionId}/records`,
        { marks: [{ userId: fixtures.cadet.id, status: "PRESENT" }] },
        officerCookie
      );

      const markedPending = await post(
        `/api/admin/attendance/sessions/${sessionId}/records`,
        { marks: [{ userId: fixtures.pending.id, status: "PRESENT" }] },
        officerCookie
      );

      const duplicate = await post(
        `/api/admin/attendance/sessions/${sessionId}/records`,
        {
          marks: [
            { userId: fixtures.cadet.id, status: "PRESENT" },
            { userId: fixtures.cadet.id, status: "ABSENT" },
          ],
        },
        officerCookie
      );

      const detail = await post(
        `/api/admin/attendance/sessions/${sessionId}/records`,
        { marks: [{ userId: fixtures.other.id, status: "ABSENT" }] },
        officerCookie
      );

      const records = detail.status === 200 ? await detail.json() : null;

      return {
        sessionId,
        markedWhileDraft: markedWhileDraft.status,
        opened: opened.status,
        marked: marked.status,
        markedPending: markedPending.status,
        duplicate: duplicate.status,
        totals: records?.totals,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.markedWhileDraft, 409);
  assert.equal(outcome.result.opened, 200);
  assert.equal(outcome.result.marked, 200);
  assert.equal(outcome.result.markedPending, 400);
  assert.equal(outcome.result.duplicate, 400);
  assert.equal(outcome.result.totals?.PRESENT, 1);
  assert.equal(outcome.result.totals?.ABSENT, 1);
});

test("the qr check-in writes the same attendance record and cannot be replayed", async (t) => {
  const outcome = await withFixtures(
    async ({ post, cookieFor, fixtures }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const officerCookie = await cookieFor(fixtures.officer);
      const cadetCookie = await cookieFor(fixtures.cadet);

      const created = await post(
        "/api/admin/attendance/sessions",
        {
          title: "Phase 3 qr session",
          activityType: "PARADE",
          date: todayInSessionTimeZone(),
          startTime: "00:00",
          endTime: "23:59",
        },
        adminCookie
      );

      const payload = await created.json();
      const sessionId = payload.session.id;

      await post(
        `/api/admin/attendance/sessions/${sessionId}/open`,
        {},
        officerCookie
      );

      const generated = await post(
        `/api/admin/attendance/sessions/${sessionId}/qr`,
        {},
        officerCookie
      );

      const generatedPayload = await generated.json();

      const cadetTriesToGenerate = await post(
        `/api/admin/attendance/sessions/${sessionId}/qr`,
        {},
        cadetCookie
      );

      const checkIn = await post(
        "/api/attendance/check-in",
        { token: generatedPayload.token },
        cadetCookie
      );

      const checkInPayload = await checkIn.json();

      const second = await post(
        "/api/attendance/check-in",
        { token: generatedPayload.token },
        cadetCookie
      );

      const secondPayload = await second.json();

      const unknown = await post(
        "/api/attendance/check-in",
        { token: "y".repeat(40) },
        cadetCookie
      );

      const officerTriesToCheckIn = await post(
        "/api/attendance/check-in",
        { token: generatedPayload.token },
        officerCookie
      );

      const revoked = await post(
        `/api/admin/attendance/sessions/${sessionId}/qr`,
        {},
        officerCookie
      );

      const afterRotation = await post(
        "/api/attendance/check-in",
        { token: generatedPayload.token },
        cookieFor(await cookieFor(fixtures.other))
      );

      return {
        generated: generated.status,
        hasQrImage: typeof generatedPayload.qrDataUrl === "string",
        hasToken: typeof generatedPayload.token === "string",
        cadetTriesToGenerate: cadetTriesToGenerate.status,
        checkIn: checkIn.status,
        method: checkInPayload.record?.method,
        status: checkInPayload.record?.status,
        second: second.status,
        duplicate: secondPayload.duplicate,
        unknown: unknown.status,
        officerTriesToCheckIn: officerTriesToCheckIn.status,
        revoked: revoked.status,
        afterRotation: afterRotation.status,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.generated, 200);
  assert.equal(outcome.result.hasQrImage, true);
  assert.equal(outcome.result.hasToken, true);
  assert.equal(outcome.result.cadetTriesToGenerate, 403);
  assert.equal(outcome.result.checkIn, 200);
  assert.equal(outcome.result.method, "QR");
  assert.equal(outcome.result.status, "PRESENT");
  assert.equal(outcome.result.second, 200);
  assert.equal(outcome.result.duplicate, true);
  assert.equal(outcome.result.unknown, 404);
  assert.equal(outcome.result.officerTriesToCheckIn, 403);
  assert.equal(outcome.result.revoked, 200);
  assert.ok(outcome.result.afterRotation >= 400);
});

test("a cadet only sees their own attendance", async (t) => {
  const outcome = await withFixtures(
    async ({ get, post, cookieFor, fixtures }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const cadetCookie = await cookieFor(fixtures.cadet);

      const created = await post(
        "/api/admin/attendance/sessions",
        {
          title: "Phase 3 own record",
          activityType: "PARADE",
          date: "2026-11-02",
        },
        adminCookie
      );

      const payload = await created.json();

      await post(
        `/api/admin/attendance/sessions/${payload.session.id}/open`,
        {},
        adminCookie
      );

      await post(
        `/api/admin/attendance/sessions/${payload.session.id}/records`,
        {
          marks: [
            { userId: fixtures.cadet.id, status: "PRESENT" },
            { userId: fixtures.other.id, status: "ABSENT" },
          ],
        },
        adminCookie
      );

      const summary = await get("/api/attendance/summary", cadetCookie);
      const summaryPayload = await summary.json();

      return {
        status: summary.status,
        records: summaryPayload.records?.length,
        present: summaryPayload.summary?.present,
        absent: summaryPayload.summary?.absent,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 200);
  assert.equal(outcome.result.records, 1);
  assert.equal(outcome.result.present, 1);
  assert.equal(outcome.result.absent, 0);
});

test("the leave request stays with its cadet and only an admin decides it", async (t) => {
  const outcome = await withFixtures(
    async ({ get, post, patch, cookieFor, fixtures }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const officerCookie = await cookieFor(fixtures.officer);
      const cadetCookie = await cookieFor(fixtures.cadet);
      const otherCookie = await cookieFor(fixtures.other);

      const created = await post(
        "/api/leave",
        {
          type: "MEDICAL",
          reason: "Fever and rest for two days",
          startDate: "2026-11-05",
          endDate: "2026-11-06",
        },
        cadetCookie
      );

      const payload = await created.json();
      const leaveId = payload.request.id;

      const otherReads = await get(`/api/leave/${leaveId}`, otherCookie);
      const own = await get(`/api/leave/${leaveId}`, cadetCookie);

      const officerDecides = await patch(
        `/api/admin/leave/${leaveId}`,
        { decision: "APPROVED", reason: "The leave is granted" },
        officerCookie
      );

      const adminDecides = await patch(
        `/api/admin/leave/${leaveId}`,
        { decision: "APPROVED", reason: "The leave is granted" },
        adminCookie
      );

      const adminPayload = await adminDecides.json();

      const decidesAgain = await patch(
        `/api/admin/leave/${leaveId}`,
        { decision: "REJECTED", reason: "A second decision" },
        adminCookie
      );

      const cancelDecided = await post(
        `/api/leave/${leaveId}/cancel`,
        {},
        cadetCookie
      );

      const invalidRange = await post(
        "/api/leave",
        {
          type: "PERSONAL",
          reason: "A family function at home",
          startDate: "2026-11-08",
          endDate: "2026-11-02",
        },
        cadetCookie
      );

      return {
        created: created.status,
        otherReads: otherReads.status,
        own: own.status,
        officerDecides: officerDecides.status,
        adminDecides: adminDecides.status,
        status: adminPayload.request?.status,
        reviewer: adminPayload.request?.reviewedById,
        decidesAgain: decidesAgain.status,
        cancelDecided: cancelDecided.status,
        invalidRange: invalidRange.status,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.created, 201);
  assert.equal(outcome.result.otherReads, 403);
  assert.equal(outcome.result.own, 200);
  assert.equal(outcome.result.officerDecides, 403);
  assert.equal(outcome.result.adminDecides, 200);
  assert.equal(outcome.result.status, "APPROVED");
  assert.ok(outcome.result.reviewer);
  assert.equal(outcome.result.decidesAgain, 409);
  assert.equal(outcome.result.cancelDecided, 409);
  assert.equal(outcome.result.invalidRange, 400);
});

test("the csv export is protected and carries no secret", async (t) => {
  const outcome = await withFixtures(
    async ({ get, post, cookieFor, fixtures }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const officerCookie = await cookieFor(fixtures.officer);

      const created = await post(
        "/api/admin/attendance/sessions",
        {
          title: "Phase 3 export session",
          activityType: "PARADE",
          date: "2026-11-02",
        },
        adminCookie
      );

      const payload = await created.json();

      await post(
        `/api/admin/attendance/sessions/${payload.session.id}/open`,
        {},
        adminCookie
      );

      await post(
        `/api/admin/attendance/sessions/${payload.session.id}/records`,
        { marks: [{ userId: fixtures.cadet.id, status: "PRESENT" }] },
        adminCookie
      );

      const asOfficer = await get("/api/admin/attendance/export", officerCookie);
      const asAdmin = await get("/api/admin/attendance/export", adminCookie);
      const csv = await asAdmin.text();

      const reports = await get("/api/admin/attendance/reports", officerCookie);

      return {
        asOfficer: asOfficer.status,
        asAdmin: asAdmin.status,
        contentType: asAdmin.headers.get("content-type"),
        csv,
        reports: reports.status,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.asOfficer, 403);
  assert.equal(outcome.result.asAdmin, 200);
  assert.match(outcome.result.contentType ?? "", /text\/csv/);
  assert.match(outcome.result.csv, /session_title/);
  assert.match(outcome.result.csv, /attendance_status/);
  assert.doesNotMatch(outcome.result.csv, /password/i);
  assert.equal(outcome.result.reports, 200);
});

test("a cancelled session is excluded from the report", async (t) => {
  const outcome = await withFixtures(
    async ({ get, post, cookieFor, fixtures }) => {
      const adminCookie = await cookieFor(fixtures.admin);

      const created = await post(
        "/api/admin/attendance/sessions",
        {
          title: "Phase 3 cancelled session",
          activityType: "PARADE",
          date: "2026-11-02",
        },
        adminCookie
      );

      const payload = await created.json();

      await post(
        `/api/admin/attendance/sessions/${payload.session.id}/cancel`,
        { reason: "The unit was on a holiday" },
        adminCookie
      );

      const report = await get(
        "/api/admin/attendance/reports?from=2026-11-01&to=2026-11-03",
        adminCookie
      );

      const reportPayload = await report.json();

      return {
        report: report.status,
        sessions: reportPayload.sessions?.length ?? -1,
        titles: (reportPayload.sessions ?? []).map((session) => session.title),
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.report, 200);
  assert.equal(
    outcome.result.titles.includes("Phase 3 cancelled session"),
    false
  );
});

test("an administrator reads the audit history and nobody else can", async (t) => {
  const outcome = await withFixtures(
    async ({ get, post, cookieFor, fixtures }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const officerCookie = await cookieFor(fixtures.officer);
      const cadetCookie = await cookieFor(fixtures.cadet);

      const created = await post(
        "/api/admin/attendance/sessions",
        {
          title: "Phase 3 audit session",
          activityType: "PARADE",
          date: "2026-11-02",
        },
        adminCookie
      );

      const payload = await created.json();
      const sessionId = payload.session.id;

      await post(
        `/api/admin/attendance/sessions/${sessionId}/open`,
        {},
        officerCookie
      );

      await post(
        `/api/admin/attendance/sessions/${sessionId}/records`,
        { marks: [{ userId: fixtures.cadet.id, status: "PRESENT" }] },
        officerCookie
      );

      // The raw token is only known to the staff. The trail must never hold it.
      const qr = await post(
        `/api/admin/attendance/sessions/${sessionId}/qr`,
        {},
        officerCookie
      );

      const qrPayload = await qr.json();

      const trail = await get("/api/admin/attendance/audit", adminCookie);
      const trailPayload = await trail.json();

      const officerTrail = await get("/api/admin/attendance/audit", officerCookie);
      const cadetTrail = await get("/api/admin/attendance/audit", cadetCookie);
      const anonymousTrail = await get("/api/admin/attendance/audit");

      return {
        trail: trail.status,
        officer: officerTrail.status,
        cadet: cadetTrail.status,
        anonymous: anonymousTrail.status,
        actions: (trailPayload.events ?? []).map((event) => event.action),
        entities: (trailPayload.events ?? []).map((event) => event.entity),
        bodies: JSON.stringify(trailPayload),
        rawToken: qrPayload.token ?? "",
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.trail, 200);
  assert.equal(outcome.result.officer, 403);
  assert.equal(outcome.result.cadet, 403);
  assert.equal(outcome.result.anonymous, 401);

  assert.ok(
    outcome.result.actions.includes("ATTENDANCE_SESSION_CREATED"),
    "the session creation is not in the trail"
  );
  assert.ok(
    outcome.result.actions.includes("ATTENDANCE_SESSION_OPENED"),
    "the session opening is not in the trail"
  );
  assert.ok(
    outcome.result.actions.includes("ATTENDANCE_MARKED"),
    "the mark is not in the trail"
  );
  assert.ok(
    outcome.result.actions.includes("ATTENDANCE_QR_TOKEN_GENERATED"),
    "the qr token is not in the trail"
  );

  // The trail holds the operational records of the unit. The account
  // lifecycle of the phase 3.5.3 is written with the entity "User", so that
  // a deactivation is visible next to the attendance operations. The roster
  // and the profile of a cadet are part of the operational trail as well, so
  // that a change of the unit is visible next to the attendance. The records
  // of the other parts of the application never appear.
  assert.ok(
    outcome.result.entities.every((entity) =>
      [
        "AttendanceSession",
        "Attendance",
        "AttendanceQrToken",
        "AttendanceManualCode",
        "LeaveRequest",
        "AttendancePolicy",
        "User",
        "Roster",
        "CadetProfile",
      ].includes(entity)
    ),
    "the trail contains an entity of another part of the application"
  );

  assert.ok(
    outcome.result.entities.every(
      (entity) =>
        !["Event", "GalleryImage", "StudyMaterial", "ContactMessage"].includes(
          entity
        )
    ),
    "the trail contains a record of the content of the website"
  );

  assert.ok(
    outcome.result.rawToken.length > 0 &&
      !outcome.result.bodies.includes(outcome.result.rawToken),
    "the raw qr token is stored in the audit history"
  );
});

test("the six digit fallback code checks a cadet in through the same record", async (t) => {
  const outcome = await withFixtures(
    async ({ get, post, delete: remove, cookieFor, fixtures, prisma }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const officerCookie = await cookieFor(fixtures.officer);
      const cadetCookie = await cookieFor(fixtures.cadet);

      const created = await post(
        "/api/admin/attendance/sessions",
        {
          title: "Phase 3 fallback code session",
          activityType: "PARADE",
          date: todayInSessionTimeZone(),
          startTime: "00:00",
          endTime: "23:59",
        },
        adminCookie
      );

      const payload = await created.json();
      const sessionId = payload.session.id;

      await post(
        `/api/admin/attendance/sessions/${sessionId}/open`,
        {},
        officerCookie
      );

      const generated = await post(
        `/api/admin/attendance/sessions/${sessionId}/manual-code`,
        {},
        officerCookie
      );

      const generatedPayload = await generated.json();
      const code = generatedPayload.code ?? "";

      const checkIn = await post(
        "/api/attendance/check-in",
        { code },
        cadetCookie
      );

      const checkInPayload = await checkIn.json();

      // The same code a second time never writes a second record.
      const replay = await post(
        "/api/attendance/check-in",
        { code },
        cadetCookie
      );

      const replayPayload = await replay.json();

      // The raw code is never stored. Only the peppered hash is.
      const stored = await prisma.attendanceManualCode.findMany({
        where: { sessionId },
      });

      const revoked = await remove(
        `/api/admin/attendance/sessions/${sessionId}/manual-code`,
        officerCookie
      );

      const afterRevoke = await post(
        "/api/attendance/check-in",
        { code },
        cadetCookie
      );

      const records = await prisma.attendance.findMany({
        where: { sessionId, userId: fixtures.cadet.id },
      });

      const read = await get(
        `/api/admin/attendance/sessions/${sessionId}/manual-code`,
        officerCookie
      );

      const readPayload = await read.json();

      return {
        generated: generated.status,
        code,
        checkIn: checkIn.status,
        duplicate: checkInPayload.duplicate,
        method: checkInPayload.record?.method,
        replay: replay.status,
        replayDuplicate: replayPayload.duplicate,
        storedHashes: stored.map((row) => row.codeHash),
        revoked: revoked.status,
        afterRevoke: afterRevoke.status,
        recordCount: records.length,
        recordStatus: records[0]?.status,
        read: read.status,
        readActive: readPayload.active,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.generated, 200);
  assert.match(outcome.result.code, /^\d{6}$/);

  assert.equal(outcome.result.checkIn, 200);
  assert.equal(outcome.result.duplicate, false);
  assert.equal(outcome.result.method, "MANUAL_CODE");

  assert.equal(outcome.result.replay, 200);
  assert.equal(outcome.result.replayDuplicate, true);

  assert.equal(outcome.result.recordCount, 1);
  assert.equal(outcome.result.recordStatus, "PRESENT");

  assert.ok(
    outcome.result.storedHashes.length > 0 &&
      outcome.result.storedHashes.every((hash) => hash !== outcome.result.code),
    "the raw fallback code is stored in the database"
  );

  assert.equal(outcome.result.revoked, 200);
  assert.equal(outcome.result.afterRevoke, 410);

  assert.equal(outcome.result.read, 200);
  assert.equal(outcome.result.readActive, false);
});

test("the quick log endpoint creates an open session and marks the roll", async (t) => {
  const outcome = await withFixtures(
    async ({ post, cookieFor, fixtures, prisma }) => {
      const officerCookie = await cookieFor(fixtures.officer);

      const created = await post(
        "/api/admin/attendance",
        {
          title: "Phase 3 quick log",
          type: "Parade",
          date: "2026-11-02",
          marks: [{ userId: fixtures.cadet.id, status: "PRESENT" }],
        },
        officerCookie
      );

      const payload = await created.json();

      const session = await prisma.attendanceSession.findUnique({
        where: { id: payload.session?.id },
      });

      const records = await prisma.attendance.findMany({
        where: { sessionId: payload.session?.id },
      });

      const trail = await prisma.auditLog.findMany({
        where: {
          userId: fixtures.officer.id,
          entity: "AttendanceSession",
        },
      });

      return {
        status: created.status,
        sessionStatus: session?.status,
        openedAt: Boolean(session?.openedAt),
        recordCount: records.length,
        recordStatus: records[0]?.status,
        recordMethod: records[0]?.method,
        actions: trail.map((event) => event.action),
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 201);
  assert.equal(outcome.result.sessionStatus, "OPEN");
  assert.equal(outcome.result.openedAt, true);
  assert.equal(outcome.result.recordCount, 1);
  assert.equal(outcome.result.recordStatus, "PRESENT");
  assert.equal(outcome.result.recordMethod, "MANUAL");
  assert.ok(
    outcome.result.actions.includes("ATTENDANCE_SESSION_CREATED"),
    "the session creation is not in the audit history"
  );
  assert.ok(
    outcome.result.actions.includes("ATTENDANCE_SESSION_OPENED"),
    "the session opening is not in the audit history"
  );
});
