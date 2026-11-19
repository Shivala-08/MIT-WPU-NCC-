export const USER_OMIT: Readonly<{
  password: true;
  approvalDecisionSource: true;
}>;

export function stripPassword<T>(record: T): T;
export function stripPasswordFromRecords<T>(records: T[]): T[];
export function stripPasswordFromRecords<T>(records: T): T;
