/**
 * Reports whether the audit trail can be written at all.
 */
export function auditTrailAvailable(db: unknown): boolean;

/**
 * Refuses a privileged change when the audit trail is not available.
 */
export function assertAuditTrailAvailable(db: unknown): void;

/**
 * Writes one audit event. The redaction is applied when the event is written.
 */
export function writeAuditEvent(
  db: unknown,
  event: {
    actorId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    oldData?: unknown;
    newData?: unknown;
  }
): Promise<unknown>;
