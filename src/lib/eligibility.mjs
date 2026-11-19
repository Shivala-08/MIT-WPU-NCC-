/**
 * @typedef {"PENDING" | "APPROVED" | "REJECTED"} ApprovalStatus
 * @typedef {"NONE" | "AUTOMATIC" | "ADMINISTRATOR"} ApprovalDecisionSource
 */

export const APPROVAL_STATUSES = Object.freeze([
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

/**
 * The origin of an approval decision.
 *
 * The decision of an administrator is authoritative. An account that an
 * administrator put back into PENDING is never approved automatically by a
 * later sign in.
 */
export const APPROVAL_DECISION_SOURCES = Object.freeze([
  "NONE",
  "AUTOMATIC",
  "ADMINISTRATOR",
]);

export const DEFAULT_ALLOWED_EMAIL_DOMAIN = "mitwpu.edu.in";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Normalises an approval state to its canonical spelling.
 *
 * The value that a filter or a query uses has to be the canonical one. A raw
 * lowercase value would never match the enum of the database.
 *
 * @param {unknown} value
 * @returns {ApprovalStatus | null}
 */
export function normalizeApprovalStatus(value) {
  const normalized = String(value ?? "").trim().toUpperCase();

  return APPROVAL_STATUSES.includes(/** @type {ApprovalStatus} */ (normalized))
    ? /** @type {ApprovalStatus} */ (normalized)
    : null;
}

/**
 * @param {unknown} value
 * @returns {value is ApprovalStatus}
 */
export function isApprovalStatus(value) {
  return normalizeApprovalStatus(value) !== null;
}

/**
 * Normalises the origin of an approval decision.
 *
 * @param {unknown} value
 * @returns {ApprovalDecisionSource | null}
 */
export function normalizeApprovalDecisionSource(value) {
  const normalized = String(value ?? "").trim().toUpperCase();

  return APPROVAL_DECISION_SOURCES.includes(
    /** @type {ApprovalDecisionSource} */ (normalized)
  )
    ? /** @type {ApprovalDecisionSource} */ (normalized)
    : null;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseAllowedEmailDomains(value) {
  const raw = String(value ?? "").trim();
  const source = raw.length > 0 ? raw : DEFAULT_ALLOWED_EMAIL_DOMAIN;

  const domains = source
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
    .filter((entry) => entry.length > 0);

  return domains.length > 0
    ? [...new Set(domains)]
    : [DEFAULT_ALLOWED_EMAIL_DOMAIN];
}

/**
 * @param {unknown} email
 * @param {string | string[]} [allowedDomains]
 * @returns {boolean}
 */
export function isAllowedCollegeEmail(email, allowedDomains) {
  const normalized = normalizeEmail(email);

  if (!EMAIL_PATTERN.test(normalized)) {
    return false;
  }

  const domains = Array.isArray(allowedDomains)
    ? allowedDomains
    : parseAllowedEmailDomains(allowedDomains);

  const domain = normalized.split("@")[1];

  return domains.some((allowed) => domain === allowed.toLowerCase());
}

/**
 * @param {unknown} email
 * @returns {boolean}
 */
export function isDisallowedPersonalDomain(email) {
  const normalized = normalizeEmail(email);
  const domain = normalized.split("@")[1] ?? "";

  return [
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
  ].includes(domain);
}

/**
 * @param {unknown} status
 * @returns {ApprovalStatus}
 */
export function mapLegacyProfileStatus(status) {
  const normalized = String(status ?? "")
    .trim()
    .toUpperCase();

  if (normalized === "APPROVED") {
    return "APPROVED";
  }

  if (normalized === "REJECTED") {
    return "REJECTED";
  }

  return "PENDING";
}

/**
 * @param {{
 *   currentStatus?: string | null,
 *   role?: string | null,
 *   legacyProfileStatus?: string | null,
 *   rosterMatch?: boolean,
 * }} input
 * @returns {ApprovalStatus}
 */
export function reconcileApprovalStatus({
  currentStatus,
  role,
  legacyProfileStatus,
  rosterMatch,
}) {
  if (currentStatus === "REJECTED") {
    return "REJECTED";
  }

  if (currentStatus === "APPROVED") {
    return "APPROVED";
  }

  if (role === "ADMIN" || role === "OFFICER") {
    return "APPROVED";
  }

  if (rosterMatch) {
    return "APPROVED";
  }

  if (legacyProfileStatus !== undefined && legacyProfileStatus !== null) {
    return mapLegacyProfileStatus(legacyProfileStatus);
  }

  return "PENDING";
}

/**
 * A roster row is operationally active unless it was explicitly deactivated.
 *
 * An account without a roster row is not blocked by the roster: it was
 * decided by an administrator.
 *
 * @param {{ active?: boolean | null } | null | undefined} rosterEntry
 * @returns {boolean}
 */
export function isRosterEntryActive(rosterEntry) {
  if (!rosterEntry) {
    return true;
  }

  return rosterEntry.active !== false;
}

/**
 * Reports whether a roster row matches an account for the automatic approval.
 *
 * An account without a roster row is never matched and an inactive roster
 * row never matches either.
 *
 * @param {{ active?: boolean | null } | null | undefined} rosterEntry
 * @returns {boolean}
 */
export function isRosterMatch(rosterEntry) {
  if (!rosterEntry) {
    return false;
  }

  return rosterEntry.active !== false;
}

/**
 * The effective origin of the approval decision of an account.
 *
 * The column `User.approvalDecisionSource` is the authoritative source. The
 * administrator id is only a second signal, so a decision that was recorded
 * before the column existed is still recognised as an administrator decision.
 *
 * @param {{
 *   approvalDecisionSource?: unknown,
 *   approvedById?: string | null,
 * }} account
 * @returns {ApprovalDecisionSource}
 */
export function effectiveDecisionSource(account) {
  const declared = normalizeApprovalDecisionSource(
    account?.approvalDecisionSource
  );

  if (declared === "ADMINISTRATOR") {
    return "ADMINISTRATOR";
  }

  // An account that carries an administrator id was decided by an
  // administrator. The signal is never ignored, because the decision of an
  // administrator has to survive every automatic path.
  if (account?.approvedById) {
    return "ADMINISTRATOR";
  }

  return declared ?? "NONE";
}

/**
 * Decides the approval state of an account from the roster.
 *
 * The decision of an administrator is authoritative: an account that an
 * administrator decided is never changed by the automatic path, whatever the
 * roster says.
 *
 * @param {{
 *   approvalStatus?: string | null,
 *   decisionSource?: string | null,
 *   rosterEntry?: { active?: boolean | null } | null,
 * }} input
 * @returns {{
 *   approvalStatus: ApprovalStatus,
 *   decisionSource: ApprovalDecisionSource,
 *   autoApproved: boolean,
 * }}
 */
export function decideRosterApproval({
  approvalStatus,
  decisionSource,
  rosterEntry,
}) {
  const currentStatus = normalizeApprovalStatus(approvalStatus);
  const currentSource = effectiveDecisionSource({
    approvalDecisionSource: decisionSource,
    approvedById: null,
  });

  if (currentStatus === "REJECTED") {
    return {
      approvalStatus: "REJECTED",
      decisionSource: currentSource,
      autoApproved: false,
    };
  }

  if (currentStatus === "APPROVED") {
    return {
      approvalStatus: "APPROVED",
      decisionSource: currentSource,
      autoApproved: false,
    };
  }

  // The administrator decided. The automatic path does not touch the account.
  if (currentSource === "ADMINISTRATOR") {
    return {
      approvalStatus: "PENDING",
      decisionSource: "ADMINISTRATOR",
      autoApproved: false,
    };
  }

  if (isRosterMatch(rosterEntry)) {
    return {
      approvalStatus: "APPROVED",
      decisionSource: "AUTOMATIC",
      autoApproved: true,
    };
  }

  return {
    approvalStatus: "PENDING",
    decisionSource: currentSource,
    autoApproved: false,
  };
}
