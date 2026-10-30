import { normalizeEmail } from "./eligibility.mjs";
import { syncProfileFromRoster } from "./profile-service.mjs";

/**
 * Imports roster rows and keeps the cadet profiles in sync.
 *
 * The normalised email address is the only matching key. The import never
 * changes the approval state of an account: a rejected account stays
 * rejected and a pending account stays pending until it signs in or until an
 * administrator uses the explicit approval flow.
 */

/**
 * @typedef {{
 *   email: string,
 *   fullName: string,
 *   prn: string | null,
 *   regiNumber: string | null,
 *   wing: string | null,
 *   division: string | null,
 *   year: string | null,
 *   branch: string | null,
 * }} RosterRow
 */

/**
 * @param {any} db
 * @param {{ email: string }} input
 * @returns {Promise<any | null>}
 */
async function findUserByEmail(db, { email }) {
  return db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      approvalStatus: true,
      rosterId: true,
    },
  });
}

/**
 * @param {any} db
 * @param {RosterRow} row
 * @returns {Promise<{ roster: any, created: boolean }>}
 */
async function upsertRosterRow(db, row) {
  const existing = await db.roster.findUnique({
    where: { email: row.email },
    select: { id: true, active: true },
  });

  const data = {
    fullName: row.fullName,
    prn: row.prn,
    regiNumber: row.regiNumber,
    wing: row.wing,
    division: row.division,
    year: row.year,
    branch: row.branch,
  };

  if (!existing) {
    const created = await db.roster.create({
      data: { ...data, email: row.email, active: true },
    });

    return { roster: created, created: true };
  }

  // An inactive roster row stays inactive: deactivating a row is an explicit
  // administrative decision and a later import must not undo it silently.
  const updated = await db.roster.update({
    where: { id: existing.id },
    data,
  });

  return { roster: updated, created: false };
}

/**
 * Imports the validated roster rows.
 *
 * @param {any} db
 * @param {{ rows: RosterRow[], actorId?: string | null }} input
 * @returns {Promise<{
 *   imported: number,
 *   created: number,
 *   updated: number,
 *   matched: { email: string, userId: string, profileCreated: boolean, changedFields: string[] }[],
 *   unmatched: { email: string, fullName: string, reason: string }[],
 *   attention: { email: string, message: string }[],
 * }>}
 */
export async function importRosterRows(db, { rows, actorId = null }) {
  const matched = [];
  const unmatched = [];
  const attention = [];

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const email = normalizeEmail(row.email);

    if (!email) {
      unmatched.push({
        email,
        fullName: row.fullName,
        reason: "The row has no usable email address",
      });
      continue;
    }

    const { roster, created: rowCreated } = await upsertRosterRow(db, {
      ...row,
      email,
    });

    if (rowCreated) {
      created += 1;
    } else {
      updated += 1;
    }

    if (!roster.active) {
      attention.push({
        email,
        message:
          "The roster row is inactive. It stays inactive until an administrator reactivates it.",
      });
    }

    const user = await findUserByEmail(db, { email });

    if (!user) {
      unmatched.push({
        email,
        fullName: row.fullName,
        reason:
          "No account uses this email address yet. The cadet is approved automatically at the first sign in.",
      });
      continue;
    }

    if (user.rosterId !== roster.id) {
      await db.user.update({
        where: { id: user.id },
        data: { rosterId: roster.id },
      });
    }

    const sync = await syncProfileFromRoster(db, {
      user,
      rosterRow: roster,
      actorId,
    });

    matched.push({
      email,
      userId: user.id,
      profileCreated: sync.created,
      changedFields: sync.changed,
    });
  }

  if (db.auditLog && typeof db.auditLog.create === "function") {
    await db.auditLog.create({
      data: {
        userId: actorId,
        action: "ROSTER_IMPORTED",
        entity: "Roster",
        entityId: null,
        newData: {
          imported: rows.length,
          created,
          updated,
          matched: matched.length,
          unmatched: unmatched.length,
        },
      },
    });
  }

  return {
    imported: rows.length,
    created,
    updated,
    matched,
    unmatched,
    attention,
  };
}

/**
 * Activates or deactivates a roster row.
 *
 * Deactivating a row never deletes an account, never changes a role and
 * never changes the approval state.
 *
 * @param {any} db
 * @param {{ rosterId: string, active: boolean, actorId?: string | null }} input
 * @returns {Promise<{ roster: any, active: boolean }>}
 */
export async function setRosterActive(db, { rosterId, active, actorId = null }) {
  const existing = await db.roster.findUnique({
    where: { id: rosterId },
    select: { id: true, email: true, active: true },
  });

  if (!existing) {
    const error = new Error("Roster row not found");
    error.statusCode = 404;
    throw error;
  }

  const roster = await db.roster.update({
    where: { id: rosterId },
    data: { active },
  });

  if (db.auditLog && typeof db.auditLog.create === "function") {
    await db.auditLog.create({
      data: {
        userId: actorId,
        action: active ? "ROSTER_ACTIVATED" : "ROSTER_DEACTIVATED",
        entity: "Roster",
        entityId: roster.id,
        oldData: { active: existing.active },
        newData: { active },
      },
    });
  }

  return { roster, active };
}
