/**
 * Field ownership for the cadet profile.
 *
 * Every field of `CadetProfile` belongs to exactly one owner. The owner
 * decides who may write the field and which source wins when the same value
 * arrives twice.
 *
 * | Owner       | Meaning                                                        |
 * | ----------- | -------------------------------------------------------------- |
 * | `ROSTER`    | Maintained by the administrator through the roster import.      |
 * | `CADET`     | Editable by the owning cadet in their own profile.              |
 * | `ADMIN`     | Editable only by an authorized administrator.                   |
 * | `SYSTEM`    | Derived or maintained by the application (never client writable).|
 *
 * The rules are deliberately data, not `if` statements, so that the API
 * routes, the roster synchronisation and the tests all agree on the same
 * source of truth.
 */

/** @typedef {"ROSTER" | "CADET" | "ADMIN" | "SYSTEM"} FieldOwner */

/**
 * @type {Readonly<Record<string, FieldOwner>>}
 */
export const FIELD_OWNERSHIP = Object.freeze({
  fullName: "ROSTER",
  prn: "ROSTER",
  regiNumber: "ROSTER",
  wing: "ROSTER",
  division: "ROSTER",
  year: "ROSTER",
  branch: "ROSTER",
  dob: "ADMIN",
  gender: "CADET",
  bloodGroup: "CADET",
  phone: "CADET",
  address: "CADET",
  parentContact: "CADET",
  emergencyContact: "CADET",
  height: "CADET",
  weight: "CADET",
  photoUrl: "SYSTEM",
  photoThumbnailUrl: "SYSTEM",
  status: "SYSTEM",
  id: "SYSTEM",
  userId: "SYSTEM",
  createdAt: "SYSTEM",
  updatedAt: "SYSTEM",
});

/**
 * Fields a cadet may change in their own profile.
 * @type {readonly string[]}
 */
export const CADET_EDITABLE_FIELDS = Object.freeze(
  Object.keys(FIELD_OWNERSHIP).filter(
    (field) => FIELD_OWNERSHIP[field] === "CADET"
  )
);

/**
 * Fields an administrator may correct directly.
 *
 * An administrator may correct every field that somebody owns, because the
 * unit has to be able to repair a record. The system controlled fields are
 * never writable, and the approval state is not part of this list: it stays
 * on the authoritative approval path.
 *
 * @type {readonly string[]}
 */
export const ADMIN_EDITABLE_FIELDS = Object.freeze(
  Object.keys(FIELD_OWNERSHIP).filter(
    (field) => FIELD_OWNERSHIP[field] !== "SYSTEM"
  )
);

/**
 * Fields that the roster import maintains.
 * @type {readonly string[]}
 */
export const ROSTER_CONTROLLED_FIELDS = Object.freeze(
  Object.keys(FIELD_OWNERSHIP).filter(
    (field) => FIELD_OWNERSHIP[field] === "ROSTER"
  )
);

/**
 * Fields the application owns. They are never writable from a request body.
 * @type {readonly string[]}
 */
export const SYSTEM_CONTROLLED_FIELDS = Object.freeze(
  Object.keys(FIELD_OWNERSHIP).filter(
    (field) => FIELD_OWNERSHIP[field] === "SYSTEM"
  )
);

/**
 * Fields that make a profile complete.
 * @type {readonly string[]}
 */
export const COMPLETION_FIELDS = Object.freeze([
  "fullName",
  "dob",
  "bloodGroup",
  "gender",
  "phone",
  "wing",
  "division",
  "year",
  "branch",
  "photoUrl",
]);

/**
 * Fields that are useful but do not block a complete profile.
 * @type {readonly string[]}
 */
export const OPTIONAL_PROFILE_FIELDS = Object.freeze([
  "prn",
  "regiNumber",
  "address",
  "parentContact",
  "emergencyContact",
  "height",
  "weight",
]);

/**
 * Human readable labels used by the API and the user interface.
 * @type {Readonly<Record<string, string>>}
 */
export const FIELD_LABELS = Object.freeze({
  fullName: "Full name",
  prn: "PRN",
  regiNumber: "Regimental number",
  wing: "Wing",
  division: "Division",
  year: "Academic year",
  branch: "Branch",
  dob: "Date of birth",
  gender: "Gender",
  bloodGroup: "Blood group",
  phone: "Phone",
  address: "Address",
  parentContact: "Parent contact",
  emergencyContact: "Emergency contact",
  height: "Height",
  weight: "Weight",
  photoUrl: "Profile photo",
  photoThumbnailUrl: "Profile photo thumbnail",
  status: "Approval status",
});

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmptyValue(value) {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  return false;
}

/**
 * @param {object | null | undefined} record
 * @param {string[]} fields
 * @returns {string[]}
 */
export function missingFields(record, fields) {
  const source = /** @type {Record<string, unknown>} */ (record ?? {});

  return fields.filter((field) => isEmptyValue(source[field]));
}

/**
 * Completion status of a cadet profile.
 *
 * @param {object | null | undefined} profile
 * @returns {{
 *   completed: number,
 *   total: number,
 *   percent: number,
 *   missing: { field: string, label: string }[],
 *   optionalMissing: { field: string, label: string }[],
 * }}
 */
export function computeProfileCompletion(profile) {
  const missing = missingFields(profile, COMPLETION_FIELDS).map((field) => ({
    field,
    label: FIELD_LABELS[field] ?? field,
  }));

  const optionalMissing = missingFields(
    profile,
    OPTIONAL_PROFILE_FIELDS
  ).map((field) => ({
    field,
    label: FIELD_LABELS[field] ?? field,
  }));

  const total = COMPLETION_FIELDS.length;
  const completed = total - missing.length;

  return {
    completed,
    total,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    missing,
    optionalMissing,
  };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Checks a request payload against an allow list.
 *
 * Unknown fields and fields owned by somebody else are rejected instead of
 * being ignored, so a client never learns that a mass assignment attempt was
 * silently dropped.
 *
 * @param {unknown} payload
 * @param {readonly string[]} allowedFields
 * @returns {{ ok: true, values: Record<string, unknown> } | { ok: false, errors: { field: string, message: string }[] }}
 */
export function selectAllowedFields(payload, allowedFields) {
  if (!isPlainObject(payload)) {
    return {
      ok: false,
      errors: [{ field: "", message: "A JSON object with the allowed fields is required" }],
    };
  }

  const allowed = new Set(allowedFields);
  /** @type {Record<string, unknown>} */
  const values = {};
  /** @type {{ field: string, message: string }[]} */
  const errors = [];

  for (const [field, value] of Object.entries(payload)) {
    if (!allowed.has(field)) {
      const owner = FIELD_OWNERSHIP[field];

      errors.push({
        field,
        message: owner
          ? `The field "${field}" is maintained by the ${owner.toLowerCase()} and cannot be changed here`
          : `The field "${field}" is not part of the cadet profile`,
      });
      continue;
    }

    values[field] = value;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, values };
}

/**
 * Builds the profile update that a roster row is allowed to write.
 *
 * Rules:
 *   * only roster controlled fields are touched;
 *   * a roster value replaces the stored value, because the roster is the
 *     administrative source of truth for those fields;
 *   * a missing roster value never erases a stored value;
 *   * cadet controlled and administrator controlled fields are never written.
 *
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {Record<string, unknown>} rosterRow
 * @returns {{ data: Record<string, unknown>, changed: string[] }}
 */
export function buildRosterProfileUpdate(profile, rosterRow) {
  const current = /** @type {Record<string, unknown>} */ (profile ?? {});
  /** @type {Record<string, unknown>} */
  const data = {};
  /** @type {string[]} */
  const changed = [];

  for (const field of ROSTER_CONTROLLED_FIELDS) {
    const incoming = rosterRow[field];

    if (isEmptyValue(incoming)) {
      continue;
    }

    const next = typeof incoming === "string" ? incoming.trim() : incoming;

    if (current[field] === next) {
      continue;
    }

    data[field] = next;
    changed.push(field);
  }

  return { data, changed };
}

/**
 * The profile that is created for a user who has no profile yet.
 *
 * @typedef {{
 *   fullName: string,
 *   prn: string | null,
 *   regiNumber: string | null,
 *   wing: string | null,
 *   division: string | null,
 *   year: string | null,
 *   branch: string | null,
 *   photoUrl: null,
 *   photoThumbnailUrl: null,
 * }} NewProfileData
 */

/**
 * @param {{ name?: string | null }} user
 * @param {Record<string, unknown> | null | undefined} rosterRow
 * @returns {NewProfileData}
 */
export function buildNewProfileData(user, rosterRow) {
  const roster = rosterRow ?? {};

  /** @type {NewProfileData} */
  const data = {
    fullName:
      (typeof roster.fullName === "string" && roster.fullName.trim()) ||
      (typeof user?.name === "string" && user.name.trim()) ||
      "Cadet",
    prn: null,
    regiNumber: null,
    wing: null,
    division: null,
    year: null,
    branch: null,
    photoUrl: null,
    photoThumbnailUrl: null,
  };

  for (const field of ROSTER_CONTROLLED_FIELDS) {
    if (field === "fullName") {
      continue;
    }

    const value = roster[field];

    if (isEmptyValue(value)) {
      continue;
    }

    const text = typeof value === "string" ? value.trim() : String(value);

    if (field === "prn") {
      data.prn = text;
    } else if (field === "regiNumber") {
      data.regiNumber = text;
    } else if (field === "wing") {
      data.wing = text;
    } else if (field === "division") {
      data.division = text;
    } else if (field === "year") {
      data.year = text;
    } else if (field === "branch") {
      data.branch = text;
    }
  }

  return data;
}
