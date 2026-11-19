import {
  CADET_EDITABLE_FIELDS,
  buildNewProfileData,
  buildRosterProfileUpdate,
  computeProfileCompletion,
} from "./profile-fields.mjs";
import { writeAuditEvent } from "./audit-writer.mjs";
import { runInTransaction } from "./db-transaction.mjs";

/**
 * @typedef {{
 *   id: string,
 *   userId: string,
 *   fullName: string,
 *   prn: string | null,
 *   regiNumber: string | null,
 *   wing: string | null,
 *   division: string | null,
 *   year: string | null,
 *   branch: string | null,
 *   dob: Date | null,
 *   bloodGroup: string | null,
 *   gender: string | null,
 *   phone: string | null,
 *   address: string | null,
 *   parentContact: string | null,
 *   height: string | null,
 *   weight: string | null,
 *   photoUrl: string | null,
 *   photoThumbnailUrl: string | null,
 *   emergencyContact: string | null,
 *   status: string,
 * }} ProfileRecord
 */

/**
 * @typedef {{
 *   id: string,
 *   email: string,
 *   name: string,
 *   role: string,
 *   approvalStatus: string,
 *   rosterId: string | null,
 * }} UserRecord
 */

/**
 * @typedef {{
 *   id: string,
 *   fullName: string,
 *   prn: string | null,
 *   regiNumber: string | null,
 *   wing: string | null,
 *   division: string | null,
 *   year: string | null,
 *   branch: string | null,
 *   dob: string | null,
 *   bloodGroup: string | null,
 *   gender: string | null,
 *   phone: string | null,
 *   address: string | null,
 *   parentContact: string | null,
 *   height: string | null,
 *   weight: string | null,
 *   emergencyContact: string | null,
 *   hasPhoto: boolean,
 *   completion: {
 *     completed: number,
 *     total: number,
 *     percent: number,
 *     missing: { field: string, label: string }[],
 *     optionalMissing: { field: string, label: string }[],
 *   },
 * }} SerializedProfile
 */

const PROFILE_SELECT = {
  id: true,
  userId: true,
  fullName: true,
  prn: true,
  regiNumber: true,
  wing: true,
  division: true,
  year: true,
  branch: true,
  dob: true,
  bloodGroup: true,
  gender: true,
  phone: true,
  address: true,
  parentContact: true,
  height: true,
  weight: true,
  photoUrl: true,
  photoThumbnailUrl: true,
  emergencyContact: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Serialises a profile for the client.
 *
 * The stored photo paths are storage object names, never public URLs. The
 * browser only ever receives them through the authorised photo routes.
 *
 * @param {ProfileRecord | null} profile
 * @returns {SerializedProfile | null}
 */
export function serializeProfile(profile) {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    fullName: profile.fullName,
    prn: profile.prn,
    regiNumber: profile.regiNumber,
    wing: profile.wing,
    division: profile.division,
    year: profile.year,
    branch: profile.branch,
    dob: profile.dob ? new Date(profile.dob).toISOString() : null,
    bloodGroup: profile.bloodGroup,
    gender: profile.gender,
    phone: profile.phone,
    address: profile.address,
    parentContact: profile.parentContact,
    height: profile.height,
    weight: profile.weight,
    emergencyContact: profile.emergencyContact,
    hasPhoto: Boolean(profile.photoUrl),
    completion: computeProfileCompletion(profile),
  };
}

/**
 * Reads the profile that belongs to a user.
 *
 * @param {any} db
 * @param {string} userId
 * @returns {Promise<ProfileRecord | null>}
 */
export async function readProfile(db, userId) {
  return db.cadetProfile.findUnique({
    where: { userId },
    select: PROFILE_SELECT,
  });
}

/**
 * Creates the profile of a user that does not have one yet.
 *
 * The roster pre-fills the roster controlled fields, the rest stays empty so
 * that the cadet can complete it.
 *
 * @param {any} db
 * @param {{ user: UserRecord, rosterRow?: Record<string, unknown> | null }} input
 * @returns {Promise<ProfileRecord>}
 */
export async function createProfileForUser(db, { user, rosterRow = null }) {
  return db.cadetProfile.create({
    data: {
      ...buildNewProfileData(user, rosterRow),
      userId: user.id,
    },
    select: PROFILE_SELECT,
  });
}

/**
 * Returns the profile of a user and creates an empty one when it is missing.
 *
 * @param {any} db
 * @param {{ user: UserRecord, rosterRow?: Record<string, unknown> | null }} input
 * @returns {Promise<ProfileRecord>}
 */
export async function ensureProfileForUser(db, { user, rosterRow = null }) {
  const existing = await readProfile(db, user.id);

  if (existing) {
    return existing;
  }

  return createProfileForUser(db, { user, rosterRow });
}

/**
 * Writes the fields a cadet is allowed to change.
 *
 * The service enforces the cadet allow list as well, so a caller that forgets
 * to filter the request body cannot write a roster controlled field.
 *
 * @param {any} db
 * @param {{ userId: string, values: Record<string, unknown> }} input
 * @returns {Promise<{ profile: ProfileRecord, changed: string[] }>}
 */
export async function updateOwnProfile(db, { userId, values }) {
  for (const field of Object.keys(values ?? {})) {
    if (!CADET_EDITABLE_FIELDS.includes(field)) {
      const error = new Error(
        `The field "${field}" is not editable by the cadet`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  const existing = await readProfile(db, userId);

  if (!existing) {
    const error = new Error("Cadet profile not found");
    error.statusCode = 404;
    throw error;
  }

  const data = {};
  const changed = [];

  for (const [field, value] of Object.entries(values)) {
    if (value === undefined) {
      continue;
    }

    const next = value === null || value === "" ? null : value;

    if (existing[field] === next) {
      continue;
    }

    data[field] = next;
    changed.push(field);
  }

  if (changed.length === 0) {
    return { profile: existing, changed };
  }

  const profile = await db.cadetProfile.update({
    where: { userId },
    data,
    select: PROFILE_SELECT,
  });

  return { profile, changed };
}

/**
 * Writes the fields an administrator is allowed to correct.
 *
 * The approval state is never touched here: it stays on the authoritative
 * approval path in `account-service.mjs`.
 *
 * @param {any} db
 * @param {{
 *   userId: string,
 *   values: Record<string, unknown>,
 *   actorId?: string | null,
 * }} input
 * @returns {Promise<{ profile: ProfileRecord, changed: string[] }>}
 */
export async function updateProfileAsAdmin(db, { userId, values, actorId }) {
  const existing = await readProfile(db, userId);

  if (!existing) {
    const error = new Error("Cadet profile not found");
    error.statusCode = 404;
    throw error;
  }

  const data = {};
  const changed = [];

  for (const [field, value] of Object.entries(values)) {
    if (value === undefined) {
      continue;
    }

    const next = value === null || value === "" ? null : value;

    if (existing[field] === next) {
      continue;
    }

    data[field] = next;
    changed.push(field);
  }

  if (changed.length === 0) {
    return { profile: existing, changed };
  }

  // The correction of an administrator and its audit event are written in one
  // transaction. A correction is never applied without its audit event.
  const profile = await runInTransaction(db, async (tx) => {
    const updated = await tx.cadetProfile.update({
      where: { userId },
      data,
      select: PROFILE_SELECT,
    });

    await writeAuditEvent(tx, {
      actorId: actorId ?? null,
      action: "CADET_PROFILE_UPDATED",
      entity: "CadetProfile",
      entityId: updated.id,
      oldData: {
        changedFields: changed,
        ...Object.fromEntries(
          changed.map((field) => [field, existing[field] ?? null])
        ),
      },
      newData: {
        changedFields: changed,
        ...Object.fromEntries(
          changed.map((field) => [field, updated[field] ?? null])
        ),
      },
    });

    return updated;
  });

  return { profile, changed };
}

/**
 * Applies a roster row to the profile of the matching user.
 *
 * Only the roster controlled fields are written and a missing roster value
 * never erases a stored value. The approval state is never touched.
 *
 * @param {any} db
 * @param {{
 *   user: UserRecord,
 *   rosterRow: Record<string, unknown>,
 *   actorId?: string | null,
 * }} input
 * @returns {Promise<{ created: boolean, changed: string[], profile: ProfileRecord }>}
 */
export async function syncProfileFromRoster(db, { user, rosterRow, actorId }) {
  const existing = await readProfile(db, user.id);

  if (!existing) {
    // The creation of the profile and its audit event are written in one
    // transaction.
    const profile = await runInTransaction(db, async (tx) => {
      const created = await tx.cadetProfile.create({
        data: {
          ...buildNewProfileData(user, rosterRow),
          userId: user.id,
        },
        select: PROFILE_SELECT,
      });

      await writeAuditEvent(tx, {
        actorId: actorId ?? null,
        action: "CADET_PROFILE_CREATED_FROM_ROSTER",
        entity: "CadetProfile",
        entityId: created.id,
        oldData: null,
        newData: { source: "ROSTER" },
      });

      return created;
    });

    return { created: true, changed: [], profile };
  }

  const { data, changed } = buildRosterProfileUpdate(existing, rosterRow);

  if (changed.length === 0) {
    return { created: false, changed: [], profile: existing };
  }

  // The synchronisation and its audit event are written in one transaction.
  const profile = await runInTransaction(db, async (tx) => {
    const updated = await tx.cadetProfile.update({
      where: { userId: user.id },
      data,
      select: PROFILE_SELECT,
    });

    await writeAuditEvent(tx, {
      actorId: actorId ?? null,
      action: "CADET_PROFILE_SYNCED_FROM_ROSTER",
      entity: "CadetProfile",
      entityId: updated.id,
      oldData: {
        changedFields: changed,
        ...Object.fromEntries(
          changed.map((field) => [field, existing[field] ?? null])
        ),
      },
      newData: {
        changedFields: changed,
        ...Object.fromEntries(
          changed.map((field) => [field, updated[field] ?? null])
        ),
      },
    });

    return updated;
  });

  return { created: false, changed, profile };
}
