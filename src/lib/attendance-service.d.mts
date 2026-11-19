export interface SessionActor {
  id: string;
  role: string;
  approvalStatus?: string;
  name?: string;
}

export interface SessionRecord {
  id: string;
  title: string;
  type: string;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  description?: string | null;
  venue?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  status: string;
  createdById?: string | null;
  openedAt?: Date | null;
  closedAt?: Date | null;
  cancelReason?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  attendances?: unknown[];
}

export interface AttendanceRecordRow {
  id: string;
  sessionId: string;
  userId: string;
  status: string;
  method: string;
  note: string | null;
  markedById: string | null;
  markedAt: Date;
}

export interface QrTokenRow {
  id: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface ManualCodeRow {
  id: string;
  sessionId: string;
  codeHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface AttendanceTotals {
  total: number;
  PRESENT: number;
  ABSENT: number;
  ON_DUTY: number;
  LEAVE: number;
  LATE: number;
  EXCUSED: number;
}

export const DEFAULT_QR_TOKEN_TTL_MINUTES: number;
export const MAX_QR_TOKEN_TTL_MINUTES: number;
export const DEFAULT_MANUAL_CODE_TTL_MINUTES: number;
export const MAX_MANUAL_CODE_TTL_MINUTES: number;
export const MANUAL_CODE_LENGTH: number;
export const CHECK_IN_BEFORE_MINUTES: number;
export const CHECK_IN_AFTER_MINUTES: number;

export function serviceError(
  message: string,
  statusCode?: number,
  extra?: Record<string, unknown>
): Error;
export function runInTransaction<T>(
  db: unknown,
  work: (tx: unknown) => Promise<T>
): Promise<T>;
export function writeAudit(
  db: unknown,
  input: {
    actorId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    oldData?: unknown;
    newData?: unknown;
  }
): Promise<void>;
export function hashQrToken(token: string): string;
export function isStaff(actor: SessionActor | null | undefined): boolean;
export function createSession(
  db: unknown,
  input: {
    actor: SessionActor;
    input: unknown;
    openImmediately?: boolean;
  }
): Promise<SessionRecord>;
export function updateSession(
  db: unknown,
  input: {
    actor: SessionActor;
    sessionId: string;
    values: Record<string, unknown>;
  }
): Promise<SessionRecord>;
export function transitionSession(
  db: unknown,
  input: {
    actor: SessionActor;
    sessionId: string;
    action: "open" | "close" | "cancel";
    reason?: string;
  }
): Promise<SessionRecord>;
export function listSessions(
  db: unknown,
  filters?: {
    status?: string;
    from?: string;
    to?: string;
    take?: number;
    skip?: number;
  }
): Promise<SessionRecord[]>;
export function getSession(
  db: unknown,
  sessionId: string
): Promise<(SessionRecord & { attendances: unknown[] }) | null>;
export function markAttendance(
  db: unknown,
  input: {
    actor: SessionActor;
    sessionId: string;
    marks: unknown;
    reason?: string;
  }
): Promise<{ created: number; updated: number; records: AttendanceRecordRow[] }>;
export function generateQrToken(
  db: unknown,
  input: { actor: SessionActor; sessionId: string; ttlMinutes?: number }
): Promise<{ token: string; expiresAt: Date; tokenId: string }>;
export function revokeQrTokens(
  db: unknown,
  input: { actor: SessionActor; sessionId: string }
): Promise<{ revoked: number }>;
export function getActiveQrToken(
  db: unknown,
  sessionId: string
): Promise<QrTokenRow | null>;
export function checkInWithToken(
  db: unknown,
  input: {
    actor: SessionActor;
    token: string;
    now?: Date;
  }
): Promise<{
  duplicate: boolean;
  record: AttendanceRecordRow;
  session: { id: string; title: string; date: Date };
}>;
export function summarizeSession(records: unknown[]): AttendanceTotals;
export function manualCodePepper(override?: string): string;
export function hashManualCode(code: string, pepper: string): string;
export function isManualCodeFormat(value: unknown): boolean;
export function generateManualCodeValue(): string;
export function generateManualCode(
  db: unknown,
  input: {
    actor: SessionActor;
    sessionId: string;
    ttlMinutes?: number;
    now?: Date;
    pepper?: string;
  }
): Promise<{ code: string; expiresAt: Date; codeId: string }>;
export function getActiveManualCode(
  db: unknown,
  input: { sessionId: string; now?: Date }
): Promise<ManualCodeRow | null>;
export function revokeManualCodes(
  db: unknown,
  input: { actor: SessionActor; sessionId: string; now?: Date }
): Promise<{ revoked: number }>;
export function checkInWithManualCode(
  db: unknown,
  input: {
    actor: SessionActor;
    code: string;
    now?: Date;
    pepper?: string;
  }
): Promise<{
  duplicate: boolean;
  record: AttendanceRecordRow;
  session: { id: string; title: string; date: Date };
}>;
export function assertCheckInWindow(session: SessionRecord, now: Date): void;
