/**
 * @typedef {"PENDING" | "APPROVED" | "REJECTED"} ApprovalStatus
 */

export const APPROVAL_STATUSES = Object.freeze([
  "PENDING",
  "APPROVED",
  "REJECTED",
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
 * @param {unknown} value
 * @returns {value is ApprovalStatus}
 */
export function isApprovalStatus(value) {
  return (
    typeof value === "string" &&
    APPROVAL_STATUSES.includes(/** @type {ApprovalStatus} */ (value.toUpperCase()))
  );
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
 * @param {{
 *   approvalStatus?: string | null,
 *   rosterEntry?: { active?: boolean } | null,
 * }} input
 * @returns {{ approvalStatus: ApprovalStatus, source: "EXISTING" | "ROSTER" | "DEFAULT" }}
 */
export function decideRosterApproval({ approvalStatus, rosterEntry }) {
  if (approvalStatus === "REJECTED") {
    return { approvalStatus: "REJECTED", source: "EXISTING" };
  }

  if (approvalStatus === "APPROVED") {
    return { approvalStatus: "APPROVED", source: "EXISTING" };
  }

  if (rosterEntry && rosterEntry.active !== false) {
    return { approvalStatus: "APPROVED", source: "ROSTER" };
  }

  return { approvalStatus: "PENDING", source: "DEFAULT" };
}
