/**
 * The single place where an audit event is written.
 *
 * Every event of the application goes through this writer, so the redaction
 * of the trail is applied to every event and not only to the events of the
 * services that know about it.
 *
 * The redaction happens when the event is written. A value that is not
 * allowed in the trail is therefore never stored.
 */

import { assertAuditHashKey, redactAuditEvent } from "./audit-redaction.mjs";

/**
 * Reports whether the audit trail can be written at all.
 *
 * @param {any} db
 * @returns {boolean}
 */
export function auditTrailAvailable(db) {
  return Boolean(db?.auditLog && typeof db.auditLog.create === "function");
}

/**
 * Refuses a privileged change when the audit trail is not available.
 *
 * A change of an administrator is never applied without its audit event. If
 * the trail cannot be written, the change is not applied either.
 *
 * @param {any} db
 * @returns {void}
 */
export function assertAuditTrailAvailable(db) {
  if (auditTrailAvailable(db)) {
    return;
  }

  const error = new Error(
    "The audit trail is not available, so the change was not applied."
  );
  error.statusCode = 500;
  throw error;
}

/**
 * Writes one audit event.
 *
 * @param {any} db
 * @param {{
 *   actorId?: string | null,
 *   action: string,
 *   entity: string,
 *   entityId?: string | null,
 *   oldData?: unknown,
 *   newData?: unknown,
 * }} event
 * @returns {Promise<any>}
 */
export async function writeAuditEvent(
  db,
  { actorId, action, entity, entityId, oldData = null, newData = null }
) {
  assertAuditTrailAvailable(db);

  // In production the trail needs the dedicated key of the references. The
  // check runs before the event is written, so an event with an unusable
  // reference is never stored. The error leaves the transaction of the
  // caller, so the business change is rolled back with it.
  assertAuditHashKey();

  const redacted = redactAuditEvent({
    action,
    entity,
    entityId: entityId ?? null,
    oldData,
    newData,
  });

  return db.auditLog.create({
    data: {
      userId: actorId ?? null,
      action: redacted.action,
      entity: redacted.entity,
      entityId: redacted.entityId,
      oldData: redacted.oldData,
      newData: redacted.newData,
    },
  });
}
