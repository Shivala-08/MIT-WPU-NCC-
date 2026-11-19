export interface AttendancePolicyRecord {
  id: string;
  version: number;
  thresholdPercent: number;
  thresholdConfirmed: boolean;
  lateCountsAsPresent: boolean;
  excusedExcludedFromDenominator: boolean;
  activityTypes: string[];
  notes: string | null;
  updatedById?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export function readPolicy(db: unknown): Promise<AttendancePolicyRecord>;
export function updatePolicy(
  db: unknown,
  input: {
    actor: { id: string; role: string };
    values: Record<string, unknown>;
  }
): Promise<AttendancePolicyRecord>;
