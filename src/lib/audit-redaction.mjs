/**
 * The redaction of the audit trail.
 *
 * The audit trail is an operational record. It answers the question "what
 * changed and who changed it". It is not a second copy of the personal data
 * of the unit.
 *
 * The rules are applied when the event is written, never when it is read.
 * A value that is not allowed in the trail is therefore never stored in the
 * first place, and it cannot leak through an export, a report or a backup of
 * the trail.
 *
 * The classes of the redaction:
 *
 *   * dropped   - the key disappears. Credentials, tokens, the hashes of the
 *                 authentication secrets and the private paths of the photo
 *                 storage are never stored.
 *   * name only - the key stays, the value is replaced. The phone number, the
 *                 address, the contact of the parent, the contact of the
 *                 emergency and the name of a cadet are never stored as a
 *                 value, but the trail still shows which field changed.
 *   * masked    - the key stays, the value is masked. The PRN and the
 *                 regimental number keep their last two characters only.
 *   * year      - the key stays, the date of birth is reduced to its year.
 *   * reference - the key stays, the email address is replaced by a keyed
 *                 HMAC reference. The same address always produces the same
 *                 reference and the address itself is never stored.
 *   * text      - the key stays, the free text is scrubbed from email
 *                 addresses, from long numbers and from identifiers.
 *   * safe      - the key stays and the value is stored as it is. Only the
 *                 operational values are in this class.
 *
 * A key that is in none of the classes is dropped. The trail can therefore
 * never grow into a complete copy of a record.
 *
 * The key of the email references
 * --------------------------------
 * The reference of an address is a keyed HMAC. The key decides whether two
 * processes can correlate the same address, so the rules depend on the
 * environment of the process:
 *
 *   * production needs a dedicated `AUDIT_HASH_KEY` of at least 16 characters.
 *     The secret of the authentication and the secret of the check-in code are
 *     never used as the key of the trail, and a key that repeats one of them
 *     is refused. A missing or an invalid key is an error: the audit write is
 *     refused and the business transaction of the caller is rolled back.
 *   * development may fall back to the other secrets of the machine and, if
 *     none of them is configured, to a random key of the process. The
 *     references of that fallback are only comparable inside one process, so
 *     the key of the machine is configured as well.
 */

import { createHmac, randomBytes } from "node:crypto";

import { normalizeEmail } from "./eligibility.mjs";

export const AUDIT_REDACTED = "[redacted]";

export const AUDIT_REFERENCE_PREFIX = "hmac:";

/**
 * The operational values that are stored as they are.
 */
const SAFE_KEYS = new Set([
  "accountId",
  "active",
  "approvalDecisionSource",
  "approvalStatus",
  "autoApproved",
  "changedFields",
  "created",
  "createdAt",
  "decisionSource",
  "deactivatedAt",
  "expiresAt",
  "imported",
  "matched",
  "method",
  "rejectedAt",
  "revoked",
  "role",
  "rows",
  "sessionId",
  // The academic placement of a cadet. The wing, the division, the year of
  // study and the branch are the operational facts of the roster. They say
  // which unit the cadet belongs to and they are not personal data on their
  // own.
  "wing",
  "division",
  "year",
  "branch",
  "source",
  "startDate",
  "endDate",
  "status",
  "title",
  "ttlMinutes",
  "type",
  "unmatched",
  "updated",
  "updatedAt",
  "userId",
  "version",
  "date",
  "venue",
  "entityId",
]);

/**
 * The keys that never reach the trail. The credentials, the tokens, the
 * hashes of the authentication secrets and the private paths of the photo
 * storage are the most important members of this class.
 */
const DROPPED_KEYS = new Set([
  "apiKey",
  "authSecret",
  "codeHash",
  "credential",
  "credentials",
  "hash",
  "password",
  "passwordHash",
  "photoThumbnailUrl",
  "photoUrl",
  "privateKey",
  "secret",
  "sessionToken",
  "token",
  "tokenHash",
]);

/**
 * The keys whose value is personal data. The key stays, so the trail still
 * shows which field changed, but the value is never stored.
 */
const NAME_ONLY_KEYS = new Set([
  "address",
  // The blood group, the gender and the measurements of the body describe
  // the person, not the operation. The trail keeps the name of the field so
  // that the change is visible, but never the value.
  "bloodGroup",
  "emergencyContact",
  "fullName",
  "gender",
  "height",
  "name",
  "parentContact",
  "phone",
  "value",
  "weight",
]);

/**
 * The keys that are masked. The last two characters survive, the rest is
 * replaced.
 */
const MASKED_KEYS = new Set(["prn", "regiNumber"]);

/**
 * The keys whose date is reduced to its year.
 */
const YEAR_KEYS = new Set(["dob"]);

/**
 * The keys whose email address is replaced by a keyed reference.
 */
const EMAIL_KEYS = new Set(["email"]);

/**
 * The keys whose free text is scrubbed.
 */
const FREE_TEXT_KEYS = new Set([
  "description",
  "note",
  "notes",
  "reason",
  "reviewReason",
  "deactivationReason",
  "rejectionReason",
]);

const EMAIL_IN_TEXT = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const LONG_NUMBER_IN_TEXT = /\b\d{6,}\b/g;
const IDENTIFIER_IN_TEXT = /\b[A-Z]{1,6}\/[A-Z0-9/.-]{3,}\b/g;

const MAX_FREE_TEXT_LENGTH = 500;

/**
 * The shortest key that is accepted.
 */
export const AUDIT_HASH_KEY_MIN_LENGTH = 16;

/**
 * The secrets that are never the key of the audit references in production.
 *
 * The key of the audit trail is a dedicated secret. Reusing the secret of the
 * authentication or of the check-in code would put two different protections
 * on one value, so a production deployment that does that is refused.
 */
export const AUDIT_HASH_KEY_DEDICATION_NAMES = Object.freeze([
  "ATTENDANCE_CODE_SECRET",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
]);

/**
 * Reports whether the process runs in production.
 *
 * The mode is decided by the environment of the process and never by the
 * environment that a caller passes, so the production rule cannot be bypassed
 * by handing a different environment to a function.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function isProductionEnvironment(env = process.env) {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

/**
 * Builds the error of a misconfigured key.
 *
 * @param {string} message
 * @returns {Error & { statusCode?: number }}
 */
function auditHashKeyError(message) {
  const error = new Error(message);
  error.statusCode = 500;
  return error;
}

/**
 * Resolves the key of the email references in a development environment.
 *
 * The key never leaves the server. Without a key the address is not stored
 * at all, because an unkeyed hash of an email address can be brute forced
 * with a list of the addresses of the institute.
 *
 * The other secrets of the deployment are accepted here, so a development
 * machine needs one configuration. They are **not** accepted in production:
 * see `productionAuditHashKey`.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function auditHashKey(env = process.env) {
  const candidate =
    env.AUDIT_HASH_KEY ??
    env.ATTENDANCE_CODE_SECRET ??
    env.AUTH_SECRET ??
    env.NEXTAUTH_SECRET;

  if (
    typeof candidate === "string" &&
    candidate.trim().length >= AUDIT_HASH_KEY_MIN_LENGTH
  ) {
    return candidate;
  }

  return null;
}

/**
 * Resolves the key of the email references in production.
 *
 * Only `AUDIT_HASH_KEY` is accepted. The secret of the authentication and the
 * secret of the check-in code are never used as the key of the audit trail,
 * and a key that repeats one of them is refused as well, because the key of
 * the trail has to be dedicated.
 *
 * A missing or an invalid key throws. The caller is a write of the audit
 * trail, so the refusal rolls the business transaction back.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function productionAuditHashKey(env = process.env) {
  const candidate = env.AUDIT_HASH_KEY;

  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    throw auditHashKeyError(
      "AUDIT_HASH_KEY is not configured. The audit trail cannot be written in production."
    );
  }

  if (candidate.trim().length < AUDIT_HASH_KEY_MIN_LENGTH) {
    throw auditHashKeyError(
      `AUDIT_HASH_KEY is too short. The audit trail needs a key of at least ${AUDIT_HASH_KEY_MIN_LENGTH} characters.`
    );
  }

  for (const name of AUDIT_HASH_KEY_DEDICATION_NAMES) {
    const other = env[name];

    if (
      typeof other === "string" &&
      other.trim().length > 0 &&
      other.trim() === candidate.trim()
    ) {
      throw auditHashKeyError(
        `AUDIT_HASH_KEY must be a dedicated secret. It must not be the same value as ${name}.`
      );
    }
  }

  return candidate;
}

/**
 * The process local fallback key.
 *
 * It keeps the reference a keyed HMAC even when the deployment forgot to
 * configure a key. The references of two processes are then not comparable,
 * so a real key has to be configured for a stable correlation.
 *
 * The fallback is a development convenience. It is never used in production:
 * there the missing key is an error, not a degraded mode.
 *
 * @type {string | null}
 */
let fallbackKey = null;

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
function resolveKey(env) {
  if (isProductionEnvironment(process.env)) {
    return productionAuditHashKey(env);
  }

  const configured = auditHashKey(env);

  if (configured) {
    return configured;
  }

  if (!fallbackKey) {
    fallbackKey = randomBytes(32).toString("hex");
    console.warn(
      "AUDIT_HASH_KEY is not configured. The email references of the audit trail are only comparable inside this process."
    );
  }

  return fallbackKey;
}

/**
 * Makes sure that the audit trail can be written.
 *
 * In production the trail needs the dedicated key. The check runs before the
 * event is written, so an event with an unusable reference is never stored and
 * the business transaction of the caller is rolled back.
 *
 * In development the check always succeeds; the fallback key is used and a
 * warning is written.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {void}
 */
export function assertAuditHashKey(env = process.env) {
  if (isProductionEnvironment(process.env)) {
    productionAuditHashKey(env);
  }
}

/**
 * The stable reference of an email address.
 *
 * @param {unknown} value
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function emailReference(value, env = process.env) {
  const email = normalizeEmail(value);

  if (!email) {
    return AUDIT_REDACTED;
  }

  const digest = createHmac("sha256", resolveKey(env))
    .update(email)
    .digest("hex")
    .slice(0, 32);

  return `${AUDIT_REFERENCE_PREFIX}${digest}`;
}

/**
 * Masks an identifier. Only the last two characters survive.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function maskIdentifier(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return AUDIT_REDACTED;
  }

  if (text.length <= 2) {
    return "*".repeat(text.length);
  }

  return `${"*".repeat(text.length - 2)}${text.slice(-2)}`;
}

/**
 * Reduces a date to its year.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function reduceToYear(value) {
  if (value === null || value === undefined || value === "") {
    return AUDIT_REDACTED;
  }

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return AUDIT_REDACTED;
  }

  return String(date.getUTCFullYear());
}

/**
 * Scrubs a free text from the personal data it may carry.
 *
 * @param {unknown} value
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function redactFreeText(value, env = process.env) {
  const text = String(value ?? "");

  if (!text) {
    return "";
  }

  const scrubbed = text
    .replace(EMAIL_IN_TEXT, (match) => emailReference(match, env))
    .replace(LONG_NUMBER_IN_TEXT, (match) => `***${match.slice(-2)}`)
    .replace(IDENTIFIER_IN_TEXT, (match) => `***${match.slice(-2)}`)
    .replace(/\s+/g, " ")
    .trim();

  return scrubbed.length > MAX_FREE_TEXT_LENGTH
    ? `${scrubbed.slice(0, MAX_FREE_TEXT_LENGTH)}…`
    : scrubbed;
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function normalizeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (value && typeof value === "object") {
    const result = {};

    for (const [key, entry] of Object.entries(value)) {
      result[key] = normalizeValue(entry);
    }

    return result;
  }

  return value;
}

/**
 * Redacts one payload of an audit event.
 *
 * @param {unknown} payload
 * @param {Record<string, string | undefined>} [env]
 * @returns {Record<string, unknown> | null}
 */
export function redactAuditPayload(payload, env = process.env) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  /** @type {Record<string, unknown>} */
  const result = {};

  for (const [key, rawValue] of Object.entries(payload)) {
    if (DROPPED_KEYS.has(key)) {
      continue;
    }

    if (NAME_ONLY_KEYS.has(key)) {
      result[key] = AUDIT_REDACTED;
      continue;
    }

    if (MASKED_KEYS.has(key)) {
      result[key] = maskIdentifier(rawValue);
      continue;
    }

    if (YEAR_KEYS.has(key)) {
      result[key] = reduceToYear(rawValue);
      continue;
    }

    if (EMAIL_KEYS.has(key)) {
      result[key] = emailReference(rawValue, env);
      continue;
    }

    if (FREE_TEXT_KEYS.has(key)) {
      result[key] = redactFreeText(rawValue, env);
      continue;
    }

    if (SAFE_KEYS.has(key)) {
      result[key] = normalizeValue(rawValue);
      continue;
    }

    // A key that is in none of the classes is not stored. The trail never
    // grows into a copy of a record.
  }

  return result;
}

/**
 * Redacts a whole audit event.
 *
 * @param {{
 *   action: string,
 *   entity: string,
 *   entityId?: string | null,
 *   oldData?: unknown,
 *   newData?: unknown,
 * }} event
 * @param {Record<string, string | undefined>} [env]
 * @returns {{
 *   action: string,
 *   entity: string,
 *   entityId: string | null,
 *   oldData: Record<string, unknown> | null,
 *   newData: Record<string, unknown> | null,
 * }}
 */
export function redactAuditEvent(event, env = process.env) {
  return {
    action: event.action,
    entity: event.entity,
    entityId: event.entityId ?? null,
    oldData: redactAuditPayload(event.oldData, env),
    newData: redactAuditPayload(event.newData, env),
  };
}
