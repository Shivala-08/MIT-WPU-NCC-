/**
 * The rules of the public contact form.
 *
 * The module has no dependency on the framework, so every limit can be proved
 * by the test suite without a server. The route of the application uses the
 * same functions.
 *
 * The form is public and unauthenticated. The limits below are the first line
 * of defence against an oversized or malformed submission; they do not replace
 * throttling or a challenge, which are separate work items.
 */

/**
 * The hard limit of the whole request body.
 *
 * A real submission is a few hundred bytes. The field limits below sum to well
 * under this number, so a body that reaches 8 KB was not typed by a person.
 */
export const CONTACT_BODY_MAX_BYTES = 8_000;

/**
 * The maximum length of every field, counted in characters.
 *
 * The values are chosen so that a genuine message is always accepted and a
 * database row stays small enough that the inbox stays usable:
 *
 * - name     100  A full name with honorifics fits comfortably.
 * - email    254  The practical maximum of an e-mail address (RFC 5321 path).
 * - subject  200  One line, comparable to a mail subject.
 * - message 5000  Several paragraphs, far more than the form invites.
 */
export const CONTACT_FIELD_LIMITS = Object.freeze({
  name: 100,
  email: 254,
  subject: 200,
  message: 5000,
});

const FIELD_ORDER = ["name", "email", "subject", "message"];

const FIELD_LABELS = Object.freeze({
  name: "Name",
  email: "E-mail address",
  subject: "Subject",
  message: "Message",
});

/**
 * A validation failure that the route can turn into a 400 response.
 */
export class ContactValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "ContactValidationError";
    this.statusCode = 400;
    this.field = field;
  }
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * A pragmatic e-mail shape check.
 *
 * The authoritative check of a real address is delivery. This check only
 * rejects input that is obviously not an address, and it does not pretend to
 * implement RFC 5322.
 */
function isPlausibleEmail(value) {
  if (value.length > CONTACT_FIELD_LIMITS.email) {
    return false;
  }

  if (/\s/.test(value)) {
    return false;
  }

  const at = value.indexOf("@");

  if (at <= 0 || at !== value.lastIndexOf("@")) {
    return false;
  }

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);

  if (local.length === 0 || domain.length === 0) {
    return false;
  }

  if (!domain.includes(".")) {
    return false;
  }

  if (domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }

  return true;
}

/**
 * Validates a parsed contact submission.
 *
 * The returned object holds only the four known fields, trimmed. An unknown
 * field of the request is discarded instead of being stored.
 *
 * @param {unknown} input
 * @returns {{ name: string, email: string, subject: string, message: string }}
 * @throws {ContactValidationError}
 */
export function validateContactSubmission(input) {
  if (!isPlainObject(input)) {
    throw new ContactValidationError("The submission is not valid");
  }

  const result = {};

  for (const field of FIELD_ORDER) {
    const label = FIELD_LABELS[field];
    const raw = input[field];

    if (raw === undefined || raw === null) {
      throw new ContactValidationError(`${label} is required`, field);
    }

    if (typeof raw !== "string") {
      throw new ContactValidationError(`${label} must be text`, field);
    }

    const value = raw.trim();

    if (value.length === 0) {
      throw new ContactValidationError(`${label} is required`, field);
    }

    const limit = CONTACT_FIELD_LIMITS[field];

    if (value.length > limit) {
      throw new ContactValidationError(
        `${label} must be ${limit} characters or fewer`,
        field
      );
    }

    result[field] = value;
  }

  const minimums = { name: 2, subject: 3, message: 10 };

  for (const [field, minimum] of Object.entries(minimums)) {
    if (result[field].length < minimum) {
      throw new ContactValidationError(
        `${FIELD_LABELS[field]} must be at least ${minimum} characters`,
        field
      );
    }
  }

  if (!isPlausibleEmail(result.email)) {
    throw new ContactValidationError(
      "Please enter a valid e-mail address",
      "email"
    );
  }

  return result;
}
