import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addAttendanceUser,
  createFakeAttendanceDb,
} from "./helpers/fake-db.mjs";
import {
  checkInWithToken,
  createSession,
  generateQrToken,
  getActiveQrToken,
  hashQrToken,
  markAttendance,
  revokeQrTokens,
  transitionSession,
} from "../src/lib/attendance-service.mjs";
import {
  cancelLeave,
  reviewLeave,
  submitLeave,
} from "../src/lib/leave-service.mjs";

const ADMIN = { id: "admin-1", role: "ADMIN", approvalStatus: "APPROVED" };
const OFFICER = { id: "officer-1", role: "OFFICER", approvalStatus: "APPROVED" };

function buildDb() {
  const db = createFakeAttendanceDb();
  const cadet = addAttendanceUser(db);
  const pending = addAttendanceUser(db, {
    id: "pending-1",
    approvalStatus: "PENDING",
  });
  const rejected = addAttendanceUser(db, {
    id: "rejected-1",
    approvalStatus: "REJECTED",
  });
  const staff = addAttendanceUser(db, { id: "admin-1", role: "ADMIN" });
  const officer = addAttendanceUser(db, { id: "officer-1", role: "OFFICER" });

  return { db, cadet, pending, rejected, staff, officer };
}

async function openSession(db, overrides = {}) {
  const session = await createSession(db, {
    actor: ADMIN,
    input: {
      title: "Morning parade",
      activityType: "PARADE",
      date: "2026-11-02",
      startTime: "06:30",
      endTime: "09:30",
      ...overrides,
    },
  });

  return transitionSession(db, {
    actor: ADMIN,
    sessionId: session.id,
    action: "open",
  });
}

test("a new session starts as a draft and is written to the audit history", async () => {
  const { db } = buildDb();

  const session = await createSession(db, {
    actor: ADMIN,
    input: {
      title: "Morning parade",
      activityType: "PARADE",
      date: "2026-11-02",
      startTime: "06:30",
      endTime: "09:30",
      venue: "Main ground",
    },
  });

  assert.equal(session.status, "DRAFT");
  assert.equal(session.createdById, ADMIN.id);
  assert.equal(session.type, "PARADE");
  assert.equal(session.venue, "Main ground");

  const audit = db.state.audit.find(
    (entry) => entry.action === "ATTENDANCE_SESSION_CREATED"
  );

  assert.ok(audit);
  assert.equal(audit.entityId, session.id);
  assert.equal(audit.userId, ADMIN.id);
});

test("an invalid session is rejected", async () => {
  const { db } = buildDb();

  await assert.rejects(
    () =>
      createSession(db, {
        actor: ADMIN,
        input: { title: "", activityType: "PARADE", date: "2026-11-02" },
      }),
    (error) => error.statusCode === 400
  );
});

test("the session lifecycle follows the documented transitions", async () => {
  const { db } = buildDb();

  const session = await createSession(db, {
    actor: ADMIN,
    input: {
      title: "Morning parade",
      activityType: "PARADE",
      date: "2026-11-02",
    },
  });

  await assert.rejects(
    () =>
      transitionSession(db, {
        actor: ADMIN,
        sessionId: session.id,
        action: "close",
      }),
    (error) => error.statusCode === 409
  );

  const opened = await transitionSession(db, {
    actor: ADMIN,
    sessionId: session.id,
    action: "open",
  });

  assert.equal(opened.status, "OPEN");
  assert.ok(opened.openedAt instanceof Date);

  await assert.rejects(
    () =>
      transitionSession(db, {
        actor: ADMIN,
        sessionId: session.id,
        action: "open",
      }),
    (error) => error.statusCode === 409
  );

  await assert.rejects(
    () =>
      transitionSession(db, {
        actor: ADMIN,
        sessionId: session.id,
        action: "close",
      }),
    (error) => error.statusCode === 409
  );
});

test("a cancellation needs a reason and cannot be reopened", async () => {
  const { db } = buildDb();

  const session = await createSession(db, {
    actor: ADMIN,
    input: {
      title: "Morning parade",
      activityType: "PARADE",
      date: "2026-11-02",
    },
  });

  await assert.rejects(
    () =>
      transitionSession(db, {
        actor: ADMIN,
        sessionId: session.id,
        action: "cancel",
        reason: "no",
      }),
    (error) => error.statusCode === 400
  );

  const cancelled = await transitionSession(db, {
    actor: ADMIN,
    sessionId: session.id,
    action: "cancel",
    reason: "The unit was on a holiday",
  });

  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.cancelReason, "The unit was on a holiday");

  await assert.rejects(
    () =>
      transitionSession(db, {
        actor: ADMIN,
        sessionId: session.id,
        action: "open",
      }),
    (error) => error.statusCode === 409
  );
});

test("a session can only be closed after the roll was marked", async () => {
  const { db, cadet } = buildDb();

  const session = await openSession(db);

  await assert.rejects(
    () =>
      transitionSession(db, {
        actor: ADMIN,
        sessionId: session.id,
        action: "close",
      }),
    (error) => error.statusCode === 409
  );

  await markAttendance(db, {
    actor: OFFICER,
    sessionId: session.id,
    marks: [{ userId: cadet.id, status: "PRESENT" }],
  });

  const closed = await transitionSession(db, {
    actor: ADMIN,
    sessionId: session.id,
    action: "close",
  });

  assert.equal(closed.status, "CLOSED");
});

test("only an approved cadet can be marked", async () => {
  const { db, cadet, pending, rejected } = buildDb();

  const session = await openSession(db);

  for (const user of [pending, rejected, "not-a-real-user"]) {
    await assert.rejects(
      () =>
        markAttendance(db, {
          actor: OFFICER,
          sessionId: session.id,
          marks: [{ userId: user.id, status: "PRESENT" }],
        }),
      (error) => error.statusCode === 400
    );
  }

  const result = await markAttendance(db, {
    actor: OFFICER,
    sessionId: session.id,
    marks: [{ userId: cadet.id, status: "PRESENT" }],
  });

  assert.equal(result.created, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.records[0].method, "MANUAL");
  assert.equal(result.records[0].markedById, OFFICER.id);
});

test("a cadet can only be marked once per session", async () => {
  const { db, cadet } = buildDb();

  const session = await openSession(db);

  await assert.rejects(
    () =>
      markAttendance(db, {
        actor: OFFICER,
        sessionId: session.id,
        marks: [
          { userId: cadet.id, status: "PRESENT" },
          { userId: cadet.id, status: "ABSENT" },
        ],
      }),
    (error) => error.statusCode === 400
  );

  assert.equal(db.state.attendances.length, 0);
});

test("a correction keeps the previous value in the audit history", async () => {
  const { db, cadet } = buildDb();

  const session = await openSession(db);

  await markAttendance(db, {
    actor: OFFICER,
    sessionId: session.id,
    marks: [{ userId: cadet.id, status: "PRESENT" }],
  });

  const result = await markAttendance(db, {
    actor: OFFICER,
    sessionId: session.id,
    marks: [{ userId: cadet.id, status: "LATE" }],
    reason: "The cadet reported late",
  });

  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);
  assert.equal(db.state.attendances.length, 1);
  assert.equal(db.state.attendances[0].status, "LATE");

  const audit = db.state.audit.find(
    (entry) => entry.action === "ATTENDANCE_CORRECTED"
  );

  assert.ok(audit);
  assert.equal(audit.oldData.status, "PRESENT");
  assert.equal(audit.newData.status, "LATE");
  assert.equal(audit.newData.reason, "The cadet reported late");
  assert.equal(audit.userId, OFFICER.id);
});

test("a correction of a closed session needs an administrator and a reason", async () => {
  const { db, cadet } = buildDb();

  const session = await openSession(db);

  await markAttendance(db, {
    actor: OFFICER,
    sessionId: session.id,
    marks: [{ userId: cadet.id, status: "PRESENT" }],
  });

  await transitionSession(db, {
    actor: ADMIN,
    sessionId: session.id,
    action: "close",
  });

  await assert.rejects(
    () =>
      markAttendance(db, {
        actor: OFFICER,
        sessionId: session.id,
        marks: [{ userId: cadet.id, status: "ABSENT" }],
        reason: "A written statement",
      }),
    (error) => error.statusCode === 403
  );

  await assert.rejects(
    () =>
      markAttendance(db, {
        actor: ADMIN,
        sessionId: session.id,
        marks: [{ userId: cadet.id, status: "ABSENT" }],
      }),
    (error) => error.statusCode === 400
  );

  const result = await markAttendance(db, {
    actor: ADMIN,
    sessionId: session.id,
    marks: [{ userId: cadet.id, status: "ABSENT" }],
    reason: "A written statement of the cadet",
  });

  assert.equal(result.updated, 1);
});

test("a draft or a cancelled session cannot be marked", async () => {
  const { db, cadet } = buildDb();

  const draft = await createSession(db, {
    actor: ADMIN,
    input: {
      title: "Morning parade",
      activityType: "PARADE",
      date: "2026-11-02",
    },
  });

  await assert.rejects(
    () =>
      markAttendance(db, {
        actor: OFFICER,
        sessionId: draft.id,
        marks: [{ userId: cadet.id, status: "PRESENT" }],
      }),
    (error) => error.statusCode === 409
  );

  await transitionSession(db, {
    actor: ADMIN,
    sessionId: draft.id,
    action: "cancel",
    reason: "The session was called off",
  });

  await assert.rejects(
    () =>
      markAttendance(db, {
        actor: OFFICER,
        sessionId: draft.id,
        marks: [{ userId: cadet.id, status: "PRESENT" }],
      }),
    (error) => error.statusCode === 409
  );
});

test("a cadet cannot mark the attendance", async () => {
  const { db, cadet } = buildDb();

  const session = await openSession(db);

  await assert.rejects(
    () =>
      markAttendance(db, {
        actor: { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" },
        sessionId: session.id,
        marks: [{ userId: cadet.id, status: "PRESENT" }],
      }),
    (error) => error.statusCode === 403
  );
});

test("the qr token is stored as a hash and never as the raw token", async () => {
  const { db } = buildDb();

  const session = await openSession(db);

  const generated = await generateQrToken(db, {
    actor: OFFICER,
    sessionId: session.id,
  });

  assert.ok(generated.token.length >= 40);
  assert.equal(db.state.tokens.length, 1);
  assert.equal(db.state.tokens[0].tokenHash, hashQrToken(generated.token));
  assert.equal(db.state.tokens[0].tokenHash.includes(generated.token), false);
  assert.equal(
    db.state.audit.some(
      (entry) =>
        entry.action === "ATTENDANCE_QR_TOKEN_GENERATED" &&
        JSON.stringify(entry.newData).includes(generated.token)
    ),
    false
  );
});

test("a qr code needs an open session", async () => {
  const { db } = buildDb();

  const session = await createSession(db, {
    actor: ADMIN,
    input: {
      title: "Morning parade",
      activityType: "PARADE",
      date: "2026-11-02",
    },
  });

  await assert.rejects(
    () =>
      generateQrToken(db, {
        actor: OFFICER,
        sessionId: session.id,
      }),
    (error) => error.statusCode === 409
  );
});

test("a new qr code revokes the previous one", async () => {
  const { db } = buildDb();

  const session = await openSession(db);

  const first = await generateQrToken(db, {
    actor: OFFICER,
    sessionId: session.id,
  });

  const second = await generateQrToken(db, {
    actor: OFFICER,
    sessionId: session.id,
  });

  assert.equal(db.state.tokens.length, 2);
  assert.ok(db.state.tokens[0].revokedAt instanceof Date);
  assert.equal(db.state.tokens[1].revokedAt, null);
  assert.notEqual(first.token, second.token);

  const active = await getActiveQrToken(db, session.id);

  assert.ok(active);
  assert.equal(active.tokenHash, hashQrToken(second.token));
});

test("the officer can revoke the qr code", async () => {
  const { db } = buildDb();

  const session = await openSession(db);

  await generateQrToken(db, { actor: OFFICER, sessionId: session.id });

  const result = await revokeQrTokens(db, {
    actor: OFFICER,
    sessionId: session.id,
  });

  assert.equal(result.revoked, 1);
  assert.ok(
    db.state.audit.some((entry) => entry.action === "ATTENDANCE_QR_TOKEN_REVOKED")
  );
});

test("a valid qr code marks the cadet present", async () => {
  const { db, cadet } = buildDb();

  const session = await openSession(db);

  const generated = await generateQrToken(db, {
    actor: OFFICER,
    sessionId: session.id,
    ttlMinutes: 30,
    now: new Date("2026-11-02T01:50:00.000Z"),
  });

  const result = await checkInWithToken(db, {
    actor: { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" },
    token: generated.token,
    now: new Date("2026-11-02T02:00:00.000Z"),
  });

  assert.equal(result.duplicate, false);
  assert.equal(result.record.status, "PRESENT");
  assert.equal(result.record.method, "QR");
  assert.equal(result.record.userId, cadet.id);
  assert.ok(
    db.state.audit.some((entry) => entry.action === "ATTENDANCE_QR_CHECK_IN")
  );
});

test("a second scan of the same code does not create a second record", async () => {
  const { db, cadet } = buildDb();

  const session = await openSession(db);

  const generated = await generateQrToken(db, {
    actor: OFFICER,
    sessionId: session.id,
    ttlMinutes: 30,
    now: new Date("2026-11-02T01:50:00.000Z"),
  });

  const actor = { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" };
  const now = new Date("2026-11-02T02:00:00.000Z");

  await checkInWithToken(db, { actor, token: generated.token, now });

  const second = await checkInWithToken(db, {
    actor,
    token: generated.token,
    now,
  });

  assert.equal(second.duplicate, true);
  assert.equal(db.state.attendances.length, 1);
});

test("an expired, a revoked and an unknown qr code are rejected", async () => {
  const { db, cadet } = buildDb();

  const session = await openSession(db);

  const generated = await generateQrToken(db, {
    actor: OFFICER,
    sessionId: session.id,
    ttlMinutes: 10,
    now: new Date("2026-11-02T01:50:00.000Z"),
  });

  const actor = { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" };

  await assert.rejects(
    () =>
      checkInWithToken(db, {
        actor,
        token: generated.token,
        now: new Date("2026-11-02T02:30:00.000Z"),
      }),
    (error) => error.statusCode === 410
  );

  await assert.rejects(
    () =>
      checkInWithToken(db, {
        actor,
        token: "x".repeat(40),
        now: new Date("2026-11-02T02:00:00.000Z"),
      }),
    (error) => error.statusCode === 404
  );

  await revokeQrTokens(db, { actor: OFFICER, sessionId: session.id });

  await assert.rejects(
    () =>
      checkInWithToken(db, {
        actor,
        token: generated.token,
        now: new Date("2026-11-02T02:00:00.000Z"),
      }),
    (error) => error.statusCode === 410
  );
});

test("a check-in outside the session window is rejected", async () => {
  const { db, cadet } = buildDb();

  const session = await openSession(db);

  const generated = await generateQrToken(db, {
    actor: OFFICER,
    sessionId: session.id,
    ttlMinutes: 30,
    now: new Date("2026-11-02T08:45:00.000Z"),
  });

  await assert.rejects(
    () =>
      checkInWithToken(db, {
        actor: { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" },
        token: generated.token,
        now: new Date("2026-11-02T09:00:00.000Z"),
      }),
    (error) => error.statusCode === 409
  );
});

test("a closed or a cancelled session rejects the check-in", async () => {
  const { db, cadet } = buildDb();

  const session = await openSession(db);

  const generated = await generateQrToken(db, {
    actor: OFFICER,
    sessionId: session.id,
    ttlMinutes: 30,
    now: new Date("2026-11-02T01:50:00.000Z"),
  });

  const actor = { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" };
  const now = new Date("2026-11-02T02:00:00.000Z");

  await transitionSession(db, {
    actor: ADMIN,
    sessionId: session.id,
    action: "cancel",
    reason: "The session was called off",
  });

  await assert.rejects(
    () => checkInWithToken(db, { actor, token: generated.token, now }),
    (error) => error.statusCode === 409
  );
});

test("a pending cadet cannot check in", async () => {
  const { db, pending } = buildDb();

  const session = await openSession(db);

  const generated = await generateQrToken(db, {
    actor: OFFICER,
    sessionId: session.id,
    ttlMinutes: 30,
    now: new Date("2026-11-02T01:50:00.000Z"),
  });

  await assert.rejects(
    () =>
      checkInWithToken(db, {
        actor: { id: pending.id, role: "CADET", approvalStatus: "PENDING" },
        token: generated.token,
        now: new Date("2026-11-02T02:00:00.000Z"),
      }),
    (error) => error.statusCode === 403
  );
});

test("a leave request is only stored for the cadet that sends it", async () => {
  const { db, cadet } = buildDb();

  const request = await submitLeave(db, {
    actor: { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" },
    input: {
      type: "MEDICAL",
      reason: "Fever and rest",
      startDate: "2026-11-05",
      endDate: "2026-11-06",
    },
  });

  assert.equal(request.userId, cadet.id);
  assert.equal(request.status, "PENDING");
  assert.ok(
    db.state.audit.some((entry) => entry.action === "LEAVE_SUBMITTED")
  );

  await assert.rejects(
    () =>
      submitLeave(db, {
        actor: { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" },
        input: {
          type: "PERSONAL",
          reason: "Family function at home",
          startDate: "2026-11-06",
          endDate: "2026-11-07",
        },
      }),
    (error) => error.statusCode === 409
  );
});

test("a cadet cannot decide their own leave and a decided request stays decided", async () => {
  const { db, cadet, staff } = buildDb();

  const request = await submitLeave(db, {
    actor: { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" },
    input: {
      type: "ACADEMIC",
      reason: "An examination in the college",
      startDate: "2026-11-05",
      endDate: "2026-11-06",
    },
  });

  await assert.rejects(
    () =>
      reviewLeave(db, {
        actor: { id: cadet.id, role: "CADET" },
        id: request.id,
        decision: "APPROVED",
      }),
    (error) => error.statusCode === 403
  );

  const approved = await reviewLeave(db, {
    actor: { id: staff.id, role: "ADMIN" },
    id: request.id,
    decision: "APPROVED",
    reason: "The leave is granted",
  });

  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.reviewedById, staff.id);
  assert.ok(approved.reviewedAt instanceof Date);

  await assert.rejects(
    () =>
      reviewLeave(db, {
        actor: { id: staff.id, role: "ADMIN" },
        id: request.id,
        decision: "REJECTED",
        reason: "A second decision",
      }),
    (error) => error.statusCode === 409
  );
});

test("a rejection needs a reason", async () => {
  const { db, cadet, staff } = buildDb();

  const request = await submitLeave(db, {
    actor: { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" },
    input: {
      type: "PERSONAL",
      reason: "Family function at home",
      startDate: "2026-11-05",
      endDate: "2026-11-06",
    },
  });

  await assert.rejects(
    () =>
      reviewLeave(db, {
        actor: { id: staff.id, role: "ADMIN" },
        id: request.id,
        decision: "REJECTED",
        reason: "no",
      }),
    (error) => error.statusCode === 400
  );
});

test("only the owner can cancel a pending leave request", async () => {
  const { db, cadet, staff } = buildDb();

  const request = await submitLeave(db, {
    actor: { id: cadet.id, role: "CADET", approvalStatus: "APPROVED" },
    input: {
      type: "OTHER",
      reason: "A personal commitment outside the campus",
      startDate: "2026-11-05",
      endDate: "2026-11-06",
    },
  });

  await assert.rejects(
    () =>
      cancelLeave(db, {
        actor: { id: staff.id, role: "ADMIN" },
        id: request.id,
      }),
    (error) => error.statusCode === 403
  );

  const cancelled = await cancelLeave(db, {
    actor: { id: cadet.id, role: "CADET" },
    id: request.id,
  });

  assert.equal(cancelled.status, "CANCELLED");

  await assert.rejects(
    () =>
      cancelLeave(db, {
        actor: { id: cadet.id, role: "CADET" },
        id: request.id,
      }),
    (error) => error.statusCode === 409
  );
});
