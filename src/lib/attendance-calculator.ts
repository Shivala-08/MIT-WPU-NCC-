import {
  calculateAttendance as calculateAttendanceImplementation,
  resolvePolicy as resolvePolicyImplementation,
  summarizeByCadet as summarizeByCadetImplementation,
  summarizeBySession as summarizeBySessionImplementation,
} from "./attendance-calculator.mjs";

export interface AttendancePolicyInput {
  id?: string;
  version?: number;
  thresholdPercent?: number;
  thresholdConfirmed?: boolean;
  lateCountsAsPresent?: boolean;
  excusedExcludedFromDenominator?: boolean;
  activityTypes?: string[];
  notes?: string | null;
}

export interface AttendanceSessionInput {
  id: string;
  title?: string | null;
  type?: string | null;
  date?: Date | string | null;
  status?: string | null;
}

export interface AttendanceRecordInput {
  sessionId: string;
  userId?: string | null;
  status: string;
}

export interface AttendanceSummary {
  totalSessions: number;
  eligibleSessions: number;
  denominator: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
  /**
   * The sessions whose activity type is outside the controlled vocabulary.
   * They are counted, because they cannot be matched against the policy, and
   * they are never counted as another activity type.
   */
  unclassifiedSessions: number;
  unclassifiedActivityTypes: string[];
  attended: number;
  percentage: number;
  policyVersion: number;
  thresholdPercent: number;
  thresholdConfirmed: boolean;
  aboveThreshold: boolean | null;
  explanation: string[];
}

export interface CadetAttendanceSummary extends AttendanceSummary {
  userId: string | null;
}

export interface SessionAttendanceSummary {
  sessionId: string;
  title: string | null;
  type: string | null;
  date: Date | string | null;
  marked: number;
  attended: number;
  percentage: number;
  PRESENT: number;
  ABSENT: number;
  ON_DUTY: number;
  LEAVE: number;
  LATE: number;
  EXCUSED: number;
}

// The calculation service is written once. This file only gives the service a
// public typescript contract, so a dashboard and an API route can never read
// the result in a different way.
export const calculateAttendance = calculateAttendanceImplementation;
export const resolvePolicy = resolvePolicyImplementation;
export const summarizeByCadet = summarizeByCadetImplementation;
export const summarizeBySession = summarizeBySessionImplementation;
