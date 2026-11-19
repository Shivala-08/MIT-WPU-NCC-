export const SESSION_STATUSES: string[];
export const ATTENDANCE_STATUSES: string[];
export const ATTENDANCE_METHODS: string[];
export const ACTIVITY_TYPES: string[];
export const LEAVE_TYPES: string[];
export const LEAVE_STATUSES: string[];
export const SESSION_ACTIONS: string[];
export const MAX_MARKS_PER_REQUEST: number;
export const MAX_VENUE_LENGTH: number;
export const MAX_TITLE_LENGTH: number;
export const MAX_REASON_LENGTH: number;
export const MIN_REASON_LENGTH: number;
export const MIN_CORRECTION_REASON_LENGTH: number;
export const MIN_REJECTION_REASON_LENGTH: number;
export const MAX_VENUE_ERROR: string;
export const SESSION_TIME_ZONE_OFFSET: string;

export interface FieldError {
  field: string;
  message: string;
}

export interface SessionValues {
  title?: string;
  activityType?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  venue?: string | null;
  description?: string | null;
}

export interface MarkValue {
  userId: string;
  status: string;
  note: string | null;
}

export interface LeaveValues {
  type?: string;
  reason?: string;
  startDate?: Date;
  endDate?: Date;
}

export function normalizeActivityType(value: unknown): string | null;
export function normalizeAttendanceStatus(value: unknown): string | null;
export function normalizeLeaveType(value: unknown): string | null;
export function isValidTimeString(value: unknown): boolean;
export function buildSessionWindow(
  date: string,
  startTime: string,
  endTime: string
): { startsAt: Date | null; endsAt: Date | null };
export function buildFallbackWindow(date: string): {
  startsAt: Date;
  endsAt: Date;
};
export function validateSessionInput(input: unknown): {
  ok: boolean;
  values: SessionValues;
  errors: FieldError[];
};
export function validateMarks(marks: unknown): {
  ok: boolean;
  marks: MarkValue[];
  errors: FieldError[];
};
export function validateLeaveInput(input: unknown): {
  ok: boolean;
  values: LeaveValues;
  errors: FieldError[];
};
export function parseDateOnly(value: unknown): Date | null;
export function canTransitionSession(status: string, action: string): boolean;
export function isSessionOpen(session: unknown): boolean;
export function isWithinCheckInWindow(
  session: unknown,
  now: Date,
  options?: { beforeMinutes?: number; afterMinutes?: number }
): boolean;
