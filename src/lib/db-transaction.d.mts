/**
 * Runs the work inside a transaction when the database supports it.
 */
export function runInTransaction<T>(
  db: unknown,
  work: (tx: unknown) => Promise<T>
): Promise<T>;
