import {
  ACTIVITY_TYPES,
  MAX_REASON_LENGTH,
  MIN_CORRECTION_REASON_LENGTH,
  buildFallbackWindow,
  buildSessionWindow,
  canTransitionSession,
  isWithinCheckInWindow,
  normalizeAttendanceStatus,
  validateMarks,
  validateSessionInput,
} from "./attendance-rules.mjs";
import { eligibleCadetWhere } from "./attendance-eligibility.mjs";
import { writeAuditEvent } from "./audit-writer.mjs";
import { runInTransaction } from "./db-transaction.mjs";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

export const DEFAULT_QR_TOKEN_TTL_MINUTES = 10;

export const MAX_QR_TOKEN_TTL_MINUTES = 60;

export const DEFAULT_MANUAL_CODE_TTL_MINUTES = 10;

export const MAX_MANUAL_CODE_TTL_MINUTES = 30;

export const MANUAL_CODE_LENGTH = 6;

export const CHECK_IN_BEFORE_MINUTES = 30;

export const CHECK_IN_AFTER_MINUTES = 60;

export function serviceError(message, statusCode = 400, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

export { runInTransaction };

export async function writeAudit(
  db,
  { actorId, action, entity, entityId, oldData = null, newData = null }
) {
  await writeAuditEvent(db, {
    actorId,
    action,
    entity,
    entityId,
    oldData,
    newData,
  });
}

export function hashQrToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function isStaff(actor) {
  return actor?.role === "ADMIN" || actor?.role === "OFFICER";
}

export async function createSession(
  db,
  { actor, input, openImmediately = false }
) {
  const validation = validateSessionInput(input);

  if (!validation.ok) {
    throw serviceError(validation.errors[0]?.message ?? "Invalid session", 400, {
      errors: validation.errors,
    });
  }

  const values = validation.values;
  const window =
    values.startTime && values.endTime
      ? buildSessionWindow(values.date, values.startTime, values.endTime)
      : buildFallbackWindow(values.date);

  const now = new Date();

  return runInTransaction(db, async (tx) => {
    const session = await tx.attendanceSession.create({
      data: {
        title: values.title,
        type: values.activityType,
        date: new Date(`${values.date}T00:00:00.000Z`),
        startTime: values.startTime ?? null,
        endTime: values.endTime ?? null,
        description: values.description,
        venue: values.venue,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        status: openImmediately ? "OPEN" : "DRAFT",
        openedAt: openImmediately ? now : null,
        createdById: actor?.id ?? null,
      },
    });

    await writeAudit(tx, {
      actorId: actor?.id,
      action: "ATTENDANCE_SESSION_CREATED",
      entity: "AttendanceSession",
      entityId: session.id,
      oldData: null,
      newData: {
        title: session.title,
        type: session.type,
        date: session.date,
        venue: session.venue,
        status: session.status,
      },
    });

    return session;
  });
}

export async function updateSession(db, { actor, sessionId, values }) {
  if (actor?.role !== "ADMIN") {
    throw serviceError("Only an administrator can edit a session", 403);
  }

  const merged = {
    title: values?.title,
    activityType: values?.activityType ?? values?.type,
    date: values?.date,
    startTime: values?.startTime,
    endTime: values?.endTime,
    venue: values?.venue,
    description: values?.description,
  };

  const hasUpdate = Object.values(merged).some(
    (value) => value !== undefined
  );

  if (!hasUpdate) {
    throw serviceError("There is nothing to update", 400);
  }

  const existing = await db.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!existing) {
    throw serviceError("Session not found", 404);
  }

  if (existing.status !== "DRAFT") {
    throw serviceError(
      "Only a draft session can be edited. Open or cancel it first.",
      409
    );
  }

  const validation = validateSessionInput({
    title: merged.title ?? existing.title,
    activityType: merged.activityType ?? existing.type,
    date:
      merged.date ??
      new Date(existing.date).toISOString().slice(0, 10),
    startTime: merged.startTime ?? existing.startTime ?? "",
    endTime: merged.endTime ?? existing.endTime ?? "",
    venue: merged.venue ?? existing.venue ?? "",
    description: merged.description ?? existing.description ?? "",
  });

  if (!validation.ok) {
    throw serviceError(validation.errors[0]?.message ?? "Invalid session", 400, {
      errors: validation.errors,
    });
  }

  const values2 = validation.values;
  const window =
    values2.startTime && values2.endTime
      ? buildSessionWindow(values2.date, values2.startTime, values2.endTime)
      : buildFallbackWindow(values2.date);

  return runInTransaction(db, async (tx) => {
    const session = await tx.attendanceSession.update({
      where: { id: sessionId },
      data: {
        title: values2.title,
        type: values2.activityType,
        date: new Date(`${values2.date}T00:00:00.000Z`),
        startTime: values2.startTime ?? null,
        endTime: values2.endTime ?? null,
        venue: values2.venue,
        description: values2.description,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      },
    });

    await writeAudit(tx, {
      actorId: actor?.id,
      action: "ATTENDANCE_SESSION_UPDATED",
      entity: "AttendanceSession",
      entityId: session.id,
      oldData: {
        title: existing.title,
        type: existing.type,
        date: existing.date,
        venue: existing.venue,
        status: existing.status,
      },
      newData: {
        title: session.title,
        type: session.type,
        date: session.date,
        venue: session.venue,
        status: session.status,
      },
    });

    return session;
  });
}

export async function transitionSession(db, { actor, sessionId, action, reason }) {
  if (!isStaff(actor)) {
    throw serviceError("Only staff can change a session", 403);
  }

  if (!["open", "close", "cancel"].includes(action)) {
    throw serviceError("Unknown session action", 400);
  }

  const session = await db.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw serviceError("Session not found", 404);
  }

  if (!canTransitionSession(session.status, action)) {
    throw serviceError(
      `A ${session.status.toLowerCase()} session cannot be ${action}ed`,
      409
    );
  }

  const cleanReason = typeof reason === "string" ? reason.trim() : "";

  if (action === "cancel") {
    if (cleanReason.length < 5) {
      throw serviceError(
        "A cancellation needs a reason of at least 5 characters",
        400
      );
    }

    if (cleanReason.length > MAX_REASON_LENGTH) {
      throw serviceError(
        `The reason can be at most ${MAX_REASON_LENGTH} characters long`,
        400
      );
    }
  }

  if (action === "close") {
    const marked = await db.attendance.count({
      where: { sessionId: session.id },
    });

    if (marked === 0) {
      throw serviceError(
        "The session has no attendance records yet. Mark the roll before closing it.",
        409
      );
    }
  }

  const now = new Date();

  const data =
    action === "open"
      ? { status: "OPEN", openedAt: now, closedAt: null, cancelReason: null }
      : action === "close"
        ? { status: "CLOSED", closedAt: now }
        : { status: "CANCELLED", cancelReason: cleanReason, closedAt: now };

  return runInTransaction(db, async (tx) => {
    const updated = await tx.attendanceSession.update({
      where: { id: sessionId },
      data,
    });

    if (action === "close" || action === "cancel") {
      await tx.attendanceQrToken.updateMany({
        where: { sessionId: session.id, revokedAt: null },
        data: { revokedAt: now },
      });

      // A fallback code only lives while the session is open.
      await tx.attendanceManualCode.updateMany({
        where: { sessionId: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
    }

    await writeAudit(tx, {
      actorId: actor?.id,
      action:
        action === "open"
          ? "ATTENDANCE_SESSION_OPENED"
          : action === "close"
            ? "ATTENDANCE_SESSION_CLOSED"
            : "ATTENDANCE_SESSION_CANCELLED",
      entity: "AttendanceSession",
      entityId: session.id,
      oldData: { status: session.status },
      newData: {
        status: updated.status,
        reason: cleanReason.length > 0 ? cleanReason : null,
      },
    });

    return updated;
  });
}

export async function listSessions(db, { status, from, to, take = 50, skip = 0 } = {}) {
  const where = {};

  if (status) {
    where.status = status;
  }

  if (from || to) {
    where.date = {};

    if (from) {
      where.date.gte = new Date(`${from}T00:00:00.000Z`);
    }

    if (to) {
      where.date.lte = new Date(`${to}T23:59:59.999Z`);
    }
  }

  return db.attendanceSession.findMany({
    where,
    orderBy: { date: "desc" },
    take,
    skip,
  });
}

export async function getSession(db, sessionId) {
  return db.attendanceSession.findUnique({
    where: { id: sessionId },
    include: {
      attendances: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              approvalStatus: true,
              cadetProfile: {
                select: {
                  fullName: true,
                  prn: true,
                  regiNumber: true,
                  wing: true,
                  division: true,
                  year: true,
                  branch: true,
                },
              },
            },
          },
          markedBy: { select: { id: true, name: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function markAttendance(db, { actor, sessionId, marks, reason }) {
  if (!isStaff(actor)) {
    throw serviceError("Only staff can mark attendance", 403);
  }

  const validation = validateMarks(marks);

  if (!validation.ok) {
    throw serviceError(validation.errors[0]?.message ?? "Invalid marks", 400, {
      errors: validation.errors,
    });
  }

  const session = await db.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw serviceError("Session not found", 404);
  }

  if (session.status === "CANCELLED") {
    throw serviceError("A cancelled session cannot be marked", 409);
  }

  if (session.status === "DRAFT") {
    throw serviceError("Open the session before marking attendance", 409);
  }

  const cleanReason = typeof reason === "string" ? reason.trim() : "";

  if (session.status === "CLOSED") {
    if (actor?.role !== "ADMIN") {
      throw serviceError(
        "Only an administrator can correct a closed session",
        403
      );
    }

    if (cleanReason.length < MIN_CORRECTION_REASON_LENGTH) {
      throw serviceError(
        `A correction on a closed session needs a reason of at least ${MIN_CORRECTION_REASON_LENGTH} characters`,
        400
      );
    }
  }

  const userIds = validation.marks.map((mark) => mark.userId);

  // Only a cadet that may take part in the attendance can be marked. The
  // roster row of the cadet has to be active, otherwise the cadet is not on
  // the roll of the unit any more.
  const eligible = await db.user.findMany({
    where: eligibleCadetWhere({ id: { in: userIds } }),
    select: { id: true },
  });

  const eligibleIds = new Set(eligible.map((cadet) => cadet.id));
  const invalidUserIds = userIds.filter((id) => !eligibleIds.has(id));

  if (invalidUserIds.length > 0) {
    throw serviceError(
      "Attendance can only be recorded for cadets with an approved account",
      400,
      { invalidUserIds }
    );
  }

  const now = new Date();

  return runInTransaction(db, async (tx) => {
    const existing = await tx.attendance.findMany({
      where: { sessionId: session.id, userId: { in: userIds } },
    });

    const existingByUser = new Map(existing.map((row) => [row.userId, row]));

    let created = 0;
    let updated = 0;
    const records = [];

    for (const mark of validation.marks) {
      const previous = existingByUser.get(mark.userId);
      const isCorrection = Boolean(previous);

      if (isCorrection && previous.status === mark.status && !mark.note) {
        records.push(previous);
        continue;
      }

      const record = previous
        ? await tx.attendance.update({
            where: { id: previous.id },
            data: {
              status: mark.status,
              note: mark.note,
              method: "MANUAL",
              markedById: actor?.id ?? null,
              markedAt: now,
            },
          })
        : await tx.attendance.create({
            data: {
              sessionId: session.id,
              userId: mark.userId,
              status: mark.status,
              note: mark.note,
              method: "MANUAL",
              markedById: actor?.id ?? null,
              markedAt: now,
            },
          });

      records.push(record);

      if (isCorrection) {
        updated += 1;
      } else {
        created += 1;
      }

      await writeAudit(tx, {
        actorId: actor?.id,
        action: isCorrection
          ? "ATTENDANCE_CORRECTED"
          : "ATTENDANCE_MARKED",
        entity: "Attendance",
        entityId: record.id,
        oldData: previous
          ? {
              status: previous.status,
              note: previous.note ?? null,
              method: previous.method,
            }
          : null,
        newData: {
          status: record.status,
          note: record.note ?? null,
          method: record.method,
          sessionId: session.id,
          userId: record.userId,
          reason: cleanReason.length > 0 ? cleanReason : null,
        },
      });
    }

    return { created, updated, records };
  });
}

export async function generateQrToken(
  db,
  { actor, sessionId, ttlMinutes = DEFAULT_QR_TOKEN_TTL_MINUTES, now = new Date() }
) {
  if (!isStaff(actor)) {
    throw serviceError("Only staff can start a QR check-in", 403);
  }

  const session = await db.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw serviceError("Session not found", 404);
  }

  if (session.status !== "OPEN") {
    throw serviceError(
      "A QR check-in needs an open session",
      409
    );
  }

  const ttl = Math.min(
    Math.max(Number(ttlMinutes) || DEFAULT_QR_TOKEN_TTL_MINUTES, 1),
    MAX_QR_TOKEN_TTL_MINUTES
  );

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashQrToken(token);
  const expiresAt = new Date(now.getTime() + ttl * 60_000);

  return runInTransaction(db, async (tx) => {
    await tx.attendanceQrToken.updateMany({
      where: { sessionId: session.id, revokedAt: null },
      data: { revokedAt: now },
    });

    const stored = await tx.attendanceQrToken.create({
      data: {
        sessionId: session.id,
        tokenHash,
        expiresAt,
        createdById: actor?.id ?? null,
      },
    });

    await writeAudit(tx, {
      actorId: actor?.id,
      action: "ATTENDANCE_QR_TOKEN_GENERATED",
      entity: "AttendanceQrToken",
      entityId: stored.id,
      oldData: null,
      newData: {
        sessionId: session.id,
        expiresAt: stored.expiresAt,
        ttlMinutes: ttl,
      },
    });

    return { token, expiresAt, tokenId: stored.id };
  });
}

export async function revokeQrTokens(db, { actor, sessionId }) {
  if (!isStaff(actor)) {
    throw serviceError("Only staff can revoke a QR check-in", 403);
  }

  const session = await db.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw serviceError("Session not found", 404);
  }

  const now = new Date();

  const result = await runInTransaction(db, async (tx) => {
    const revoked = await tx.attendanceQrToken.updateMany({
      where: { sessionId: session.id, revokedAt: null },
      data: { revokedAt: now },
    });

    await writeAudit(tx, {
      actorId: actor?.id,
      action: "ATTENDANCE_QR_TOKEN_REVOKED",
      entity: "AttendanceSession",
      entityId: session.id,
      oldData: null,
      newData: { revoked: revoked?.count ?? 0 },
    });

    return revoked;
  });

  return { revoked: result?.count ?? 0 };
}

export async function getActiveQrToken(db, sessionId) {
  const token = await db.attendanceQrToken.findFirst({
    where: { sessionId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!token) {
    return null;
  }

  return token.expiresAt && new Date(token.expiresAt).getTime() < Date.now()
    ? null
    : token;
}

export async function checkInWithToken(db, { actor, token, now = new Date() }) {
  if (typeof token !== "string" || token.trim().length < 20) {
    throw serviceError("The check-in code is not valid", 400);
  }

  const tokenHash = hashQrToken(token.trim());

  const stored = await db.attendanceQrToken.findUnique({
    where: { tokenHash },
    include: { session: true },
  });

  if (!stored) {
    throw serviceError("The check-in code is not valid", 404);
  }

  const session = stored.session;

  if (!session || session.status !== "OPEN") {
    throw serviceError("This session is not open for check-in", 409);
  }

  if (stored.revokedAt) {
    throw serviceError("The check-in code was revoked", 410);
  }

  if (new Date(stored.expiresAt).getTime() <= now.getTime()) {
    throw serviceError("The check-in code expired", 410);
  }

  assertCheckInWindow(session, now);

  return recordCheckIn(db, { actor, session, method: "QR", now });
}

/**
 * The pepper of the fallback code.
 *
 * The pepper never leaves the server. It turns the six digit code into a hash
 * that cannot be brute forced from a stolen database dump.
 */
export function manualCodePepper(override) {
  const pepper =
    override ??
    process.env.ATTENDANCE_CODE_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;

  if (typeof pepper !== "string" || pepper.trim().length < 16) {
    throw serviceError("The check-in code service is not configured", 500);
  }

  return pepper;
}

export function hashManualCode(code, pepper) {
  return createHmac("sha256", pepper)
    .update(String(code).trim())
    .digest("hex");
}

export function isManualCodeFormat(value) {
  return typeof value === "string" && /^\d{6}$/.test(value.trim());
}

/**
 * A cryptographically secure six digit code.
 *
 * randomInt is a uniform generator of the platform crypto module. The code is
 * never derived from the session, the date or the time.
 */
export function generateManualCodeValue() {
  return String(randomInt(0, 1_000_000)).padStart(MANUAL_CODE_LENGTH, "0");
}

export async function generateManualCode(
  db,
  {
    actor,
    sessionId,
    ttlMinutes = DEFAULT_MANUAL_CODE_TTL_MINUTES,
    now = new Date(),
    pepper,
  }
) {
  if (!isStaff(actor)) {
    throw serviceError("Only staff can create a manual check-in code", 403);
  }

  const session = await db.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw serviceError("Session not found", 404);
  }

  if (session.status !== "OPEN") {
    throw serviceError("A manual check-in code needs an open session", 409);
  }

  const ttl = Math.min(
    Math.max(
      Number(ttlMinutes) || DEFAULT_MANUAL_CODE_TTL_MINUTES,
      1
    ),
    MAX_MANUAL_CODE_TTL_MINUTES
  );

  const code = generateManualCodeValue();
  const codeHash = hashManualCode(code, manualCodePepper(pepper));
  const expiresAt = new Date(now.getTime() + ttl * 60_000);

  return runInTransaction(db, async (tx) => {
    await tx.attendanceManualCode.updateMany({
      where: { sessionId: session.id, revokedAt: null },
      data: { revokedAt: now },
    });

    const stored = await tx.attendanceManualCode.create({
      data: {
        sessionId: session.id,
        codeHash,
        expiresAt,
        createdById: actor?.id ?? null,
      },
    });

    await writeAudit(tx, {
      actorId: actor?.id,
      action: "ATTENDANCE_MANUAL_CODE_GENERATED",
      entity: "AttendanceManualCode",
      entityId: stored.id,
      oldData: null,
      newData: {
        sessionId: session.id,
        expiresAt: stored.expiresAt,
        ttlMinutes: ttl,
      },
    });

    return { code, expiresAt, codeId: stored.id };
  });
}

export async function getActiveManualCode(db, { sessionId, now = new Date() }) {
  const stored = await db.attendanceManualCode.findFirst({
    where: { sessionId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!stored) {
    return null;
  }

  return new Date(stored.expiresAt).getTime() <= now.getTime() ? null : stored;
}

export async function revokeManualCodes(db, { actor, sessionId, now = new Date() }) {
  if (!isStaff(actor)) {
    throw serviceError("Only staff can revoke a manual check-in code", 403);
  }

  const session = await db.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw serviceError("Session not found", 404);
  }

  const result = await runInTransaction(db, async (tx) => {
    const revoked = await tx.attendanceManualCode.updateMany({
      where: { sessionId: session.id, revokedAt: null },
      data: { revokedAt: now },
    });

    await writeAudit(tx, {
      actorId: actor?.id,
      action: "ATTENDANCE_MANUAL_CODE_REVOKED",
      entity: "AttendanceSession",
      entityId: session.id,
      oldData: null,
      newData: { revoked: revoked?.count ?? 0 },
    });

    return revoked;
  });

  return { revoked: result?.count ?? 0 };
}

export async function checkInWithManualCode(
  db,
  { actor, code, now = new Date(), pepper }
) {
  if (!isManualCodeFormat(code)) {
    throw serviceError("The check-in code is not valid", 400);
  }

  const codeHash = hashManualCode(code.trim(), manualCodePepper(pepper));

  const stored = await db.attendanceManualCode.findUnique({
    where: { codeHash },
    include: { session: true },
  });

  if (!stored) {
    throw serviceError("The check-in code is not valid", 404);
  }

  const session = stored.session;

  if (!session || session.status !== "OPEN") {
    throw serviceError("This session is not open for check-in", 409);
  }

  if (stored.revokedAt) {
    throw serviceError("The check-in code was revoked", 410);
  }

  if (new Date(stored.expiresAt).getTime() <= now.getTime()) {
    throw serviceError("The check-in code expired", 410);
  }

  assertCheckInWindow(session, now);

  return recordCheckIn(db, { actor, session, method: "MANUAL_CODE", now });
}

/**
 * The shared check-in rules of the QR token and of the manual code.
 */
export function assertCheckInWindow(session, now) {
  if (
    !isWithinCheckInWindow(session, now, {
      beforeMinutes: CHECK_IN_BEFORE_MINUTES,
      afterMinutes: CHECK_IN_AFTER_MINUTES,
    })
  ) {
    throw serviceError(
      "The check-in window for this session has closed",
      409
    );
  }
}

/**
 * Writes the attendance record of a self check-in.
 *
 * The cadet identity always comes from the authenticated session. A client
 * cannot mark another cadet present.
 *
 * A cadet whose roster row is inactive cannot check in. The roster row is
 * read from the session, so the decision is the same one that the roll of
 * the session uses.
 */
export async function recordCheckIn(db, { actor, session, method, now }) {
  if (
    actor?.role !== "CADET" ||
    actor?.approvalStatus !== "APPROVED" ||
    actor?.deactivatedAt
  ) {
    throw serviceError("Only an approved cadet can check in", 403);
  }

  if (actor?.rosterActive === false) {
    throw serviceError(
      "The roster row of this cadet is inactive, so the cadet cannot check in",
      403
    );
  }

  const where = {
    userId_sessionId: { userId: actor.id, sessionId: session.id },
  };

  const existing = await db.attendance.findUnique({ where });

  if (existing) {
    return {
      duplicate: true,
      record: existing,
      session: { id: session.id, title: session.title, date: session.date },
    };
  }

  let record;

  try {
    record = await runInTransaction(db, async (tx) => {
      const created = await tx.attendance.create({
        data: {
          sessionId: session.id,
          userId: actor.id,
          status: "PRESENT",
          method,
          markedById: null,
          markedAt: now,
        },
      });

      await writeAudit(tx, {
        actorId: actor.id,
        action:
          method === "MANUAL_CODE"
            ? "ATTENDANCE_MANUAL_CODE_CHECK_IN"
            : "ATTENDANCE_QR_CHECK_IN",
        entity: "Attendance",
        entityId: created.id,
        oldData: null,
        newData: {
          sessionId: session.id,
          userId: actor.id,
          status: created.status,
          method,
        },
      });

      return created;
    });
  } catch (error) {
    // Two check-ins of the same cadet can reach the server at the same
    // moment. The unique constraint of the pair decides the race and the
    // second request reports the check-in of the first one.
    if (error?.code === "P2002") {
      const raced = await db.attendance.findUnique({ where });

      if (raced) {
        return {
          duplicate: true,
          record: raced,
          session: { id: session.id, title: session.title, date: session.date },
        };
      }
    }

    throw error;
  }

  return {
    duplicate: false,
    record,
    session: { id: session.id, title: session.title, date: session.date },
  };
}

export function summarizeSession(records) {
  const totals = {
    PRESENT: 0,
    ABSENT: 0,
    ON_DUTY: 0,
    LEAVE: 0,
    LATE: 0,
    EXCUSED: 0,
  };

  for (const record of records ?? []) {
    const status = normalizeAttendanceStatus(record?.status);

    if (status && totals[status] !== undefined) {
      totals[status] += 1;
    }
  }

  return {
    total: records?.length ?? 0,
    ...totals,
  };
}

export { ACTIVITY_TYPES };
