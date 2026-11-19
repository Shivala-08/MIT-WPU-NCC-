/**
 * The fields that are never loaded with a whole user record.
 *
 * The password hash is never loaded. The origin of the approval decision is
 * not loaded either: the column is added by the migration
 * `20261105000000_approval_decision_source`, and the application has to run
 * before and after that migration is applied. A query that loads a whole user
 * record therefore names the columns it wants, and the account service reads
 * the origin of the decision with a conditional select.
 */
export const USER_OMIT = Object.freeze({
  password: true,
  approvalDecisionSource: true,
});

export function stripPassword(record) {
  if (!record || typeof record !== "object") {
    return record;
  }
  const copy = { ...record };
  delete copy.password;
  return copy;
}

export function stripPasswordFromRecords(records) {
  if (!Array.isArray(records)) {
    return records;
  }
  return records.map(stripPassword);
}
