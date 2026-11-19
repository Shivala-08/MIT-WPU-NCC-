/**
 * The operational eligibility of a cadet for the attendance operations.
 *
 * A cadet may be marked present and may check in only when the account is
 * approved, the account is not deactivated and the roster row of the cadet
 * is active.
 *
 * An inactive roster row blocks the operational attendance only. It never
 * deactivates the account, it never changes the approval state and it never
 * removes the profile, the attendance or the leave history. A cadet may
 * still submit a leave request and an administrator may still review it.
 *
 * A cadet without a roster row is not blocked by the roster: such an account
 * was decided by an administrator.
 */

/**
 * The Prisma filter that keeps the cadets whose roster row is active.
 *
 * The filter is written as a negation, so it can be combined with the
 * search filter of a roll without a second `OR` in the same object.
 *
 * @returns {{ NOT: { roster: { is: { active: false } } } }}
 */
export function activeRosterWhere() {
  return { NOT: { roster: { is: { active: false } } } };
}

/**
 * Builds the filter of the cadets that may take part in the attendance.
 *
 * @param {Record<string, unknown>} [extra]
 * @returns {Record<string, unknown>}
 */
export function eligibleCadetWhere(extra = {}) {
  return {
    role: "CADET",
    approvalStatus: "APPROVED",
    // A deactivated account is not part of the current unit any more. Its
    // historical records stay in the database, but it is not on a roll.
    deactivatedAt: null,
    ...activeRosterWhere(),
    ...extra,
  };
}
