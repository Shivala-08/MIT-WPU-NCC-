export interface CalculatorPolicy {
  id: string;
  version: number;
  thresholdPercent: number;
  thresholdConfirmed: boolean;
  lateCountsAsPresent: boolean;
  excusedExcludedFromDenominator: boolean;
  activityTypes: string[];
  notes: string | null;
}

export interface CalculatorSession {
  id: string;
  title?: string | null;
  type?: string | null;
  date?: Date | string | null;
  status?: string | null;
}

export interface CalculatorRecord {
  sessionId: string;
  userId?: string | null;
  status: string;
}

export interface CalculatorInput {
  sessions?: CalculatorSession[];
  records?: CalculatorRecord[];
  policy?: Partial<CalculatorPolicy> | null;
}

export interface CalculatorSummary {
  totalSessions: number;
  eligibleSessions: number;
  denominator: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
  attended: number;
  percentage: number;
  policyVersion: number;
  thresholdPercent: number;
  thresholdConfirmed: boolean;
  aboveThreshold: boolean | null;
  explanation: string[];
}

export interface CalculatorCadetSummary extends CalculatorSummary {
  userId: string | null;
}

export interface CalculatorSessionSummary {
  sessionId: string;
  title?: string | null;
  type?: string | null;
  date?: Date | string | null;
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

export const DEFAULT_POLICY: CalculatorPolicy;

export function resolvePolicy(
  policy?: Partial<CalculatorPolicy> | null
): CalculatorPolicy;

export function calculateAttendance(input?: CalculatorInput): CalculatorSummary;

export function summarizeByCadet(
  input?: CalculatorInput
): CalculatorCadetSummary[];

export function summarizeBySession(
  input?: CalculatorInput
): CalculatorSessionSummary[];
