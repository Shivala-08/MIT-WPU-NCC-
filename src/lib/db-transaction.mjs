/**
 * The transaction helper of the services.
 *
 * A database that supports transactions writes the change and its audit
 * event in one transaction. A test double without transactions falls back to
 * the plain call, so the services stay testable.
 *
 * @param {any} db
 * @param {(tx: any) => Promise<any>} work
 * @returns {Promise<any>}
 */
export async function runInTransaction(db, work) {
  if (typeof db.$transaction === "function") {
    return db.$transaction((tx) => work(tx));
  }

  return work(db);
}
