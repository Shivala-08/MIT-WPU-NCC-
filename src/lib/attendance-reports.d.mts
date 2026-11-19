import type { AttendancePolicyRecord } from "./attendance-policy.mjs";

export interface ReportCadetRow {
  id: string;
  name: string;
  email: string;
  cadetProfile: {
    fullName: string;
    prn: string | null;
    regiNumber: string | null;
    wing: string | null;
    division: string | null;
    year: string | null;
    branch: string | null;
  } | null;
}

export interface ReportSessionRow {
  id: string;
  title: string;
  type: string;
  date: Date;
  venue: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: string;
}

export interface ReportAttendanceRow {
  id: string;
  sessionId: string;
  userId: string;
  status: string;
  method: string;
  markedAt: Date;
  user: ReportCadetRow;
  markedBy: { id: string; name: string } | null;
}

export interface ReportFilters {
  from?: string | null;
  to?: string | null;
  type?: string | null;
  wing?: string | null;
  division?: string | null;
  search?: string | null;
}

export function buildSessionFilter(filters: ReportFilters): Record<string, unknown>;
export function buildCadetFilter(filters: ReportFilters): Record<string, unknown>;
export function loadAttendanceReport(
  db: unknown,
  filters?: ReportFilters
): Promise<{
  sessions: ReportSessionRow[];
  cadets: ReportCadetRow[];
  records: ReportAttendanceRow[];
}>;
export function buildCadetWiseReport(input: {
  sessions: ReportSessionRow[];
  cadets: ReportCadetRow[];
  records: ReportAttendanceRow[];
  policy: AttendancePolicyRecord;
}): Array<
  ReportCadetRow & {
    userId: string;
    fullName: string;
    eligibleSessions: number;
    attended: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    unmarked: number;
    percentage: number;
  }
>;
export function buildSessionWiseReport(input: {
  sessions: ReportSessionRow[];
  records: ReportAttendanceRow[];
  policy: AttendancePolicyRecord;
}): Array<{
  sessionId: string;
  title: string | null;
  type: string | null;
  date: Date | null;
  marked: number;
  attended: number;
  percentage: number;
  PRESENT: number;
  ABSENT: number;
  ON_DUTY: number;
  LEAVE: number;
  LATE: number;
  EXCUSED: number;
}>;
export function buildGroupTotals(
  rows: Array<object>,
  key: string
): Array<{
  group: string;
  cadets: number;
  eligibleSessions: number;
  attended: number;
  percentage: number;
}>;
export function buildActivityTotals(
  sessionRows: Array<{ type?: string | null; marked: number; attended: number }>
): Array<{
  group: string;
  sessions: number;
  marked: number;
  attended: number;
  percentage: number;
}>;
