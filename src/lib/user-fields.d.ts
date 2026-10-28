export const USER_PASSWORD_OMIT: Readonly<{ password: true }>;

export function stripPassword<T>(record: T): T;
export function stripPasswordFromRecords<T>(records: T[]): T[];
export function stripPasswordFromRecords<T>(records: T): T;
