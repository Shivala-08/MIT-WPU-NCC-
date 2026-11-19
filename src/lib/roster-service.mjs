import { normalizeEmail } from "./eligibility.mjs";
import { syncProfileFromRoster } from "./profile-service.mjs";
import { writeAuditEvent } from "./audit-writer.mjs";
import { runInTransaction } from "./db-transaction.mjs";

/**
 * Imports roster rows and keeps the cadet profiles in sync.
 *
 * The normalised email address is the only matching key. The import never
 * changes the approval state of an account: a rejected account stays
 * rejected and a pending account stays pending until it signs in or until an
 * administrator uses the explicit approval flow.
 *
 * The import, the synchronisation of the profiles and the audit events are
 * written in one transaction. A roster that is not in the audit trail was
 * never imported, and an import that fails half way leaves no roster row
 * behind.
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
  // The whole import runs in one transaction. The roster rows, the link to
  // the accounts, the synchronisation of the profiles and the audit events
  // either all happen or none of them happens.
  return runInTransaction(db, async (tx) => {
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

      const { roster, created: rowCreated } = await upsertRosterRow(tx, {
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

      const user = await findUserByEmail(tx, { email });

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
        // The fields of the account are named explicitly. The column of the
        // origin of the approval decision is added by a migration that is not
        // applied to every database yet, and a query that loads the whole
        // record would ask for it.
        await tx.user.update({
          where: { id: user.id },
          data: { rosterId: roster.id },
          select: { id: true, rosterId: true },
        });
      }

      const sync = await syncProfileFromRoster(tx, {
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

    // The summary of the import is a mandatory audit event. The event is
    // written with the same transaction as the import, so a roster that is
    // not in the trail was never applied.
    await writeAuditEvent(tx, {
      actorId: actorId ?? null,
      action: "ROSTER_IMPORTED",
      entity: "Roster",
      entityId: null,
      oldData: null,
      newData: {
        imported: rows.length,
        created,
        updated,
        matched: matched.length,
        unmatched: unmatched.length,
      },
    });

    return {
      imported: rows.length,
      created,
      updated,
      matched,
      unmatched,
      attention,
    };
  });
}

/**
 * Activates or deactivates a roster row.
 *
 * Deactivating a row never deletes an account, never changes a role and
 * never changes the approval state.
 *
 * The change of the row and its audit event are written in one transaction.
 * A row whose state is not in the audit trail was never changed.
 *
 * @param {any} db
 * @param {{ rosterId: string, active: boolean, actorId?: string | null }} input
 * @returns {Promise<{ roster: any, active: boolean }>}
 */
export async function setRosterActive(db, { rosterId, active, actorId = null }) {
  return runInTransaction(db, async (tx) => {
    const existing = await tx.roster.findUnique({
      where: { id: rosterId },
      select: { id: true, email: true, active: true },
    });

    if (!existing) {
      const error = new Error("Roster row not found");
      error.statusCode = 404;
      throw error;
    }

    const roster = await tx.roster.update({
      where: { id: rosterId },
      data: { active },
    });

    await writeAuditEvent(tx, {
      actorId: actorId ?? null,
      action: active ? "ROSTER_ACTIVATED" : "ROSTER_DEACTIVATED",
      entity: "Roster",
      entityId: roster.id,
      oldData: { active: existing.active },
      newData: { active },
    });

    return { roster, active };
  });
}
