/**
 * The filter that keeps the cadets whose roster row is active.
 */
export function activeRosterWhere(): {
  NOT: { roster: { is: { active: false } } };
};

/**
 * The filter of the cadets that may take part in the attendance.
 */
export function eligibleCadetWhere(
  extra?: Record<string, unknown>
): Record<string, unknown>;
