/**
 * The origin of an approval decision and the database column that holds it.
 *
 * `User.approvalDecisionSource` is the authoritative record of who decided
 * the approval state of an account. The column is added by the migration
 * `20261105000000_approval_decision_source`.
 *
 * The application is able to run against a database that does not have the
 * column yet. The migration is applied in a separate, explicitly authorised
 * step, and the application has to keep working in the window between the
 * deployment of the code and the application of the migration.
 *
 * In that window the origin of the decision is derived from the administrator
 * id of the account. The protection of an administrator decision never
 * depends on the column alone: the column is the primary signal and the
 * administrator id is the second one, so a decision that was recorded before
 * the column existed is still recognised.
 */

/**
 * @typedef {import("./eligibility.mjs").ApprovalDecisionSource} ApprovalDecisionSource
 */

/**
 * The probe is cached per database client. The check runs once per process
 * and not once per request.
 *
 * @type {WeakMap<object, Promise<boolean>>}
 */
const supportByClient = new WeakMap();

/**
 * Reports whether the connected database has the decision source column.
 *
 * The check is read only. It never writes and it never changes the schema.
 *
 * @param {any} db
 * @returns {Promise<boolean>}
 */
export async function decisionSourceColumnAvailable(db) {
  if (!db || typeof db.$queryRawUnsafe !== "function") {
    return false;
  }

  const cached = supportByClient.get(db);

  if (cached) {
    return cached;
  }

  const probe = (async () => {
    try {
      const rows = await db.$queryRawUnsafe(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'User'
             AND column_name = 'approvalDecisionSource'
         ) AS present`
      );

      return Boolean(rows?.[0]?.present);
    } catch (error) {
      console.error(
        "Failed to check the approval decision source column:",
        error
      );
      return false;
    }
  })();

  supportByClient.set(db, probe);

  return probe;
}

/**
 * Builds the part of an update that records the origin of the decision.
 *
 * The column is only written when the database has it. The audit trail
 * always records the true origin, so the trail is complete in both cases.
 *
 * @param {ApprovalDecisionSource} source
 * @param {boolean} columnAvailable
 * @returns {Record<string, ApprovalDecisionSource>}
 */
export function decisionSourceData(source, columnAvailable) {
  return columnAvailable ? { approvalDecisionSource: source } : {};
}
