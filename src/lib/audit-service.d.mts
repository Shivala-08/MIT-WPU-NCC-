export const AUDIT_ENTITIES: string[];
export const AUDIT_ACTIONS: string[];
export const MAX_AUDIT_PAGE_SIZE: number;

export interface AuditEventRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    role: string | null;
  } | null;
}

export function auditError(
  message: string,
  statusCode?: number,
  extra?: Record<string, unknown>
): Error;

export function buildAuditFilter(input?: {
  entity?: string | null;
  action?: string | null;
  from?: string | null;
  to?: string | null;
}): Record<string, unknown>;

export function listAuditEvents(
  db: unknown,
  input?: {
    entity?: string | null;
    action?: string | null;
    from?: string | null;
    to?: string | null;
    take?: number;
    skip?: number;
  }
): Promise<{
  events: AuditEventRow[];
  total: number;
  limit: number;
  offset: number;
}>;

export function describeAuditEvent(event: {
  action: string;
  oldData?: unknown;
  newData?: unknown;
}): string;
