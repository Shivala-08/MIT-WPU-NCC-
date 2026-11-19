/**
 * The audit trail of the attendance and leave operations.
 *
 * The events are written by the services of the phase 3 inside the same
 * transaction as the change itself. A critical administrative change is never
 * applied without its audit event.
 */

// The operational records of the unit. The audit log is shared with the
// profile corrections of the phase 2 and with the account lifecycle of the
// phase 3.5.3. The account lifecycle is written with the entity "User", so
// the deactivation of an account and its reactivation are visible in the
// trail next to the attendance operations.
//
// The list is fixed. The trail never widens itself to the records of the
// other parts of the application, for example to the events, to the study
// materials or to the contact messages.
export const AUDIT_ENTITIES = [
  "AttendanceSession",
  "Attendance",
  "AttendanceQrToken",
  "AttendanceManualCode",
  "LeaveRequest",
  "AttendancePolicy",
  "User",
  // The roster and the cadet profile are part of the operational trail. A
  // change of the roster decides who is in the unit and a change of the
  // profile corrects the record of a cadet, so both belong next to the
  // attendance operations.
  "Roster",
  "CadetProfile",
];

export const AUDIT_ACTIONS = [
  "ATTENDANCE_SESSION_CREATED",
  "ATTENDANCE_SESSION_UPDATED",
  "ATTENDANCE_SESSION_OPENED",
  "ATTENDANCE_SESSION_CLOSED",
  "ATTENDANCE_SESSION_CANCELLED",
  "ATTENDANCE_MARKED",
  "ATTENDANCE_CORRECTED",
  "ATTENDANCE_QR_TOKEN_GENERATED",
  "ATTENDANCE_QR_TOKEN_REVOKED",
  "ATTENDANCE_QR_CHECK_IN",
  "ATTENDANCE_MANUAL_CODE_GENERATED",
  "ATTENDANCE_MANUAL_CODE_REVOKED",
  "ATTENDANCE_MANUAL_CODE_CHECK_IN",
  "ATTENDANCE_REPORT_EXPORTED",
  "ATTENDANCE_POLICY_CHANGED",
  "LEAVE_SUBMITTED",
  "LEAVE_APPROVED",
  "LEAVE_REJECTED",
  "LEAVE_CANCELLED",
  // The lifecycle of an account. The events are written with the entity
  // "User", so they are visible in the trail next to the attendance
  // operations.
  "REGISTRATION_SUBMITTED",
  "ACCOUNT_CREATED",
  "ACCOUNT_CREATED_ROSTER_APPROVED",
  "ACCOUNT_APPROVED_FROM_ROSTER",
  "ACCOUNT_PENDING",
  "ACCOUNT_APPROVED",
  "ACCOUNT_REJECTED",
  "ACCOUNT_DEACTIVATED",
  "ACCOUNT_REACTIVATED",
  // The roster of the unit and the profile of a cadet.
  "ROSTER_IMPORTED",
  "ROSTER_ACTIVATED",
  "ROSTER_DEACTIVATED",
  "CADET_PROFILE_CREATED_FROM_ROSTER",
  "CADET_PROFILE_SYNCED_FROM_ROSTER",
  "CADET_PROFILE_UPDATED",
  "PROFILE_CORRECTION_REQUESTED",
  "PROFILE_PHOTO_UPDATED",
  "PROFILE_PHOTO_REMOVED",
];

export const MAX_AUDIT_PAGE_SIZE = 200;

export function auditError(message, statusCode = 400, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

/**
 * Builds the filter of the audit trail.
 *
 * The entity list is fixed. A caller can never widen the trail to the events
 * of the other parts of the application.
 */
export function buildAuditFilter({ entity, action, from, to } = {}) {
  const where = {
    entity: { in: AUDIT_ENTITIES },
  };

  if (entity) {
    if (!AUDIT_ENTITIES.includes(entity)) {
      throw auditError(`Unknown audit entity: ${entity}`, 400);
    }

    where.entity = entity;
  }

  if (action) {
    if (!AUDIT_ACTIONS.includes(action)) {
      throw auditError(`Unknown audit action: ${action}`, 400);
    }

    where.action = action;
  }

  if (from || to) {
    where.createdAt = {};

    if (from) {
      where.createdAt.gte = new Date(`${from}T00:00:00.000Z`);
    }

    if (to) {
      where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
    }
  }

  return where;
}

/**
 * Reads the audit trail.
 *
 * The actor is resolved from the database. The trail never exposes the
 * password of an account or the raw value of a check-in token.
 */
export async function listAuditEvents(
  db,
  { entity, action, from, to, take = 50, skip = 0 } = {}
) {
  const where = buildAuditFilter({ entity, action, from, to });

  const limit = Math.min(Math.max(Number(take) || 50, 1), MAX_AUDIT_PAGE_SIZE);
  const offset = Math.max(Number(skip) || 0, 0);

  const [events, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.auditLog.count({ where }),
  ]);

  const actorIds = [
    ...new Set(events.map((event) => event.userId).filter(Boolean)),
  ];

  const actors =
    actorIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, role: true },
        })
      : [];

  const actorById = new Map(actors.map((actor) => [actor.id, actor]));

  return {
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId ?? null,
      oldData: event.oldData ?? null,
      newData: event.newData ?? null,
      createdAt:
        event.createdAt instanceof Date
          ? event.createdAt.toISOString()
          : event.createdAt,
      actor: event.userId
        ? {
            id: event.userId,
            name: actorById.get(event.userId)?.name ?? "A removed account",
            role: actorById.get(event.userId)?.role ?? null,
          }
        : null,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * A short, readable summary of one audit event for the list of the trail.
 */
export function describeAuditEvent(event) {
  const newData =
    event.newData && typeof event.newData === "object" ? event.newData : {};
  const oldData =
    event.oldData && typeof event.oldData === "object" ? event.oldData : {};

  if (event.action === "ATTENDANCE_SESSION_CREATED") {
    return `${newData.title ?? "A session"} was created.`;
  }

  if (event.action === "ATTENDANCE_SESSION_OPENED") {
    return "The session was opened for check-in.";
  }

  if (event.action === "ATTENDANCE_SESSION_CLOSED") {
    return "The session was closed.";
  }

  if (event.action === "ATTENDANCE_SESSION_CANCELLED") {
    return newData.reason
      ? `The session was cancelled. Reason: ${newData.reason}`
      : "The session was cancelled.";
  }

  if (event.action === "ATTENDANCE_MARKED") {
    return `The attendance was marked as ${String(newData.status ?? "").toLowerCase()}.`;
  }

  if (event.action === "ATTENDANCE_CORRECTED") {
    return `The mark was corrected from ${String(oldData.status ?? "").toLowerCase()} to ${String(newData.status ?? "").toLowerCase()}.`;
  }

  if (event.action === "ATTENDANCE_QR_TOKEN_GENERATED") {
    return "A QR check-in code was generated.";
  }

  if (event.action === "ATTENDANCE_QR_TOKEN_REVOKED") {
    return "The QR check-in code was revoked.";
  }

  if (event.action === "ATTENDANCE_QR_CHECK_IN") {
    return "A cadet checked in with the QR code.";
  }

  if (event.action === "ATTENDANCE_MANUAL_CODE_GENERATED") {
    return "A manual check-in code was generated.";
  }

  if (event.action === "ATTENDANCE_MANUAL_CODE_REVOKED") {
    return "The manual check-in code was revoked.";
  }

  if (event.action === "ATTENDANCE_MANUAL_CODE_CHECK_IN") {
    return "A cadet checked in with the manual code.";
  }

  if (event.action === "ATTENDANCE_REPORT_EXPORTED") {
    return `The attendance report was exported (${newData.rows ?? 0} rows).`;
  }

  if (event.action === "ATTENDANCE_POLICY_CHANGED") {
    return `The attendance policy was updated to version ${newData.version ?? "?"}.`;
  }

  if (event.action === "LEAVE_SUBMITTED") {
    return `A leave request was submitted (${String(newData.type ?? "").toLowerCase()}).`;
  }

  if (event.action === "LEAVE_APPROVED") {
    return "The leave request was approved.";
  }

  if (event.action === "LEAVE_REJECTED") {
    return newData.reason
      ? `The leave request was rejected. Reason: ${newData.reason}`
      : "The leave request was rejected.";
  }

  if (event.action === "LEAVE_CANCELLED") {
    return "The leave request was cancelled by the cadet.";
  }

  if (event.action === "REGISTRATION_SUBMITTED") {
    return "An account registration was submitted and waits for approval.";
  }

  if (event.action === "ACCOUNT_CREATED") {
    return "An account was created and waits for approval.";
  }

  if (
    event.action === "ACCOUNT_CREATED_ROSTER_APPROVED" ||
    event.action === "ACCOUNT_APPROVED_FROM_ROSTER"
  ) {
    return "An account was created from the roster and approved.";
  }

  if (event.action === "ACCOUNT_DEACTIVATED") {
    const reason = String(newData.reason ?? "").trim();
    return reason
      ? `The account was deactivated. Reason: ${reason}`
      : "The account was deactivated. The history of the account was kept.";
  }

  if (event.action === "ACCOUNT_REACTIVATED") {
    return "The account was reactivated.";
  }

  if (
    event.action === "ACCOUNT_PENDING" ||
    event.action === "ACCOUNT_APPROVED" ||
    event.action === "ACCOUNT_REJECTED"
  ) {
    return `The approval state of the account was changed to ${event.action
      .replace("ACCOUNT_", "")
      .toLowerCase()}.`;
  }

  if (event.action === "ROSTER_IMPORTED") {
    return `The roster was imported (${newData.imported ?? 0} rows).`;
  }

  if (event.action === "ROSTER_ACTIVATED") {
    return "The roster row was activated.";
  }

  if (event.action === "ROSTER_DEACTIVATED") {
    return "The roster row was deactivated. The account and its history stay.";
  }

  if (event.action === "CADET_PROFILE_CREATED_FROM_ROSTER") {
    return "The cadet profile was created from the roster.";
  }

  if (event.action === "CADET_PROFILE_SYNCED_FROM_ROSTER") {
    const changed = Array.isArray(newData.changedFields)
      ? newData.changedFields
      : [];

    return changed.length > 0
      ? `The cadet profile was synchronised with the roster (${changed.join(", ")}).`
      : "The cadet profile was synchronised with the roster.";
  }

  if (event.action === "CADET_PROFILE_UPDATED") {
    const changed = Array.isArray(newData.changedFields)
      ? newData.changedFields
      : [];

    return changed.length > 0
      ? `The cadet profile was corrected (${changed.join(", ")}).`
      : "The cadet profile was corrected.";
  }

  if (event.action === "PROFILE_CORRECTION_REQUESTED") {
    return `A correction of the field "${newData.field ?? "unknown"}" was requested.`;
  }

  if (event.action === "PROFILE_PHOTO_UPDATED") {
    return "The profile photo was replaced.";
  }

  if (event.action === "PROFILE_PHOTO_REMOVED") {
    return "The profile photo was removed.";
  }

  return event.action.replace(/_/g, " ").toLowerCase();
}

export { AUDIT_ENTITIES as auditEntities, AUDIT_ACTIONS as auditActions };
