import {
  decideRosterApproval,
  effectiveDecisionSource,
  isAllowedCollegeEmail,
  normalizeEmail,
  normalizeApprovalStatus,
} from "./eligibility.mjs";
import {
  decisionSourceColumnAvailable,
  decisionSourceData,
} from "./approval-decision-source.mjs";
import { writeAuditEvent } from "./audit-writer.mjs";
import { runInTransaction } from "./db-transaction.mjs";
import { syncProfileFromRoster } from "./profile-service.mjs";

/**
 * @typedef {import("./eligibility.mjs").ApprovalStatus} ApprovalStatus
 * @typedef {import("./eligibility.mjs").ApprovalDecisionSource} ApprovalDecisionSource
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   email: string,
 *   role: string,
 *   image: string | null,
 *   approvalStatus: ApprovalStatus,
 *   approvalDecisionSource?: ApprovalDecisionSource,
 *   approvedAt: Date | null,
 *   approvedById: string | null,
 *   rejectionReason: string | null,
 *   emailVerifiedAt: Date | null,
 *   rosterId: string | null,
 *   deactivatedAt: Date | null,
 *   deactivatedById: string | null,
 *   deactivationReason: string | null,
 * }} AccountRecord
 */

/**
 * @typedef {{
 *   id: string,
 *   email: string,
 *   fullName: string,
 *   prn: string | null,
 *   regiNumber: string | null,
 *   wing: string | null,
 *   division: string | null,
 *   year: string | null,
 *   branch: string | null,
 *   active: boolean,
 * }} RosterRecord
 */

export const GOOGLE_PROVIDER_ID = "google";

export const SIGN_IN_REJECTIONS = Object.freeze({
  PROVIDER_NOT_ALLOWED: "PROVIDER_NOT_ALLOWED",
  EMAIL_MISSING: "EMAIL_MISSING",
  EMAIL_NOT_ALLOWED: "EMAIL_NOT_ALLOWED",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED",
  LOOKUP_FAILED: "LOOKUP_FAILED",
});

const USER_SELECT_BASE = {
  id: true,
  name: true,
  email: true,
  role: true,
  image: true,
  approvalStatus: true,
  approvedAt: true,
  approvedById: true,
  rejectionReason: true,
  emailVerifiedAt: true,
  rosterId: true,
  deactivatedAt: true,
  deactivatedById: true,
  deactivationReason: true,
};

/**
 * The fields of an account that the service reads.
 *
 * The column of the decision source is only read when the database has it.
 * The column is added by a migration that is applied in a separate step, and
 * the service has to work in the window before that step.
 *
 * @param {boolean} decisionSourceAvailable
 * @returns {Record<string, boolean>}
 */
export function userSelect(decisionSourceAvailable) {
  return decisionSourceAvailable
    ? { ...USER_SELECT_BASE, approvalDecisionSource: true }
    : { ...USER_SELECT_BASE };
}

const MAX_DEACTIVATION_REASON_LENGTH = 500;

/**
 * An error with the HTTP status that the route has to answer with.
 *
 * @param {string} message
 * @param {number} statusCode
 * @returns {Error & { statusCode: number }}
 */
export function accountError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Runs the work inside a transaction when the database supports it.
 *
 * @param {any} db
 * @param {(tx: any) => Promise<any>} work
 * @returns {Promise<any>}
 */
export { runInTransaction };

/** @returns {Date} */
function now() {
  return new Date();
}

/**
 * @param {any} db
 * @param {string} email
 * @returns {Promise<RosterRecord | null>}
 */
async function findRosterEntry(db, email) {
  if (!db.roster || typeof db.roster.findUnique !== "function") {
    return null;
  }

  return db.roster.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      prn: true,
      regiNumber: true,
      wing: true,
      division: true,
      year: true,
      branch: true,
      active: true,
    },
  });
}

/**
 * Writes an audit event of the account lifecycle.
 *
 * The event is mandatory. A change of an account is never applied without
 * its audit event, so a database without a writable audit trail refuses the
 * change instead of applying it silently.
 *
 * @param {any} db
 * @param {{
 *   userId?: string | null,
 *   action: string,
 *   entity: string,
 *   entityId?: string | null,
 *   oldData?: unknown,
 *   newData?: unknown,
 * }} entry
 * @returns {Promise<void>}
 */
async function writeAudit(db, entry) {
  await writeAuditEvent(db, {
    actorId: entry.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    oldData: entry.oldData ?? null,
    newData: entry.newData ?? null,
  });
}

/**
 * Pre-fills the profile of a signed in account from the roster.
 *
 * The roster only writes the fields it owns and it never touches the
 * approval state. A failure is logged and never blocks the sign in.
 *
 * @param {any} db
 * @param {{ user: AccountRecord, rosterEntry: RosterRecord | null }} input
 * @returns {Promise<void>}
 */
async function syncProfileWithRoster(db, { user, rosterEntry }) {
  if (!rosterEntry || !db.cadetProfile || typeof db.cadetProfile.findUnique !== "function") {
    return;
  }

  try {
    await syncProfileFromRoster(db, { user, rosterRow: rosterEntry });
  } catch (error) {
    console.error("Failed to sync the cadet profile with the roster:", error);
  }
}

/**
 * Creates or reconciles the account behind a Google sign-in.
 *
 * The database is injected so the rule set can be exercised with a fixture
 * database in tests. The function never accepts a user id, a role or an
 * approval state from the caller: the role of a new account is always CADET
 * and the approval state is always derived from the roster and the stored row.
 *
 * @param {any} db
 * @param {{
 *   provider?: string,
 *   email: unknown,
 *   emailVerified: unknown,
 *   name?: unknown,
 *   image?: unknown,
 *   allowedEmailDomains?: string | string[],
 *   now?: () => Date,
 * }} input
 * @returns {Promise<
 *   | {
 *       ok: true,
 *       user: AccountRecord,
 *       source: ApprovalDecisionSource,
 *       autoApproved: boolean,
 *     }
 *   | { ok: false, reason: string }
 * >}
 */
export async function resolveGoogleAccount(
  db,
  {
    provider = GOOGLE_PROVIDER_ID,
    email,
    emailVerified,
    name,
    image,
    allowedEmailDomains,
    now: clock = now,
  }
) {
  if (provider !== GOOGLE_PROVIDER_ID) {
    return { ok: false, reason: SIGN_IN_REJECTIONS.PROVIDER_NOT_ALLOWED };
  }

  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return { ok: false, reason: SIGN_IN_REJECTIONS.EMAIL_MISSING };
  }

  if (!isAllowedCollegeEmail(normalizedEmail, allowedEmailDomains)) {
    return { ok: false, reason: SIGN_IN_REJECTIONS.EMAIL_NOT_ALLOWED };
  }

  if (emailVerified !== true) {
    return { ok: false, reason: SIGN_IN_REJECTIONS.EMAIL_NOT_VERIFIED };
  }

  // The column of the decision source is read only when the database has it.
  const decisionSourceAvailable = await decisionSourceColumnAvailable(db);
  const select = userSelect(decisionSourceAvailable);

  let existing = null;

  try {
    existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select,
    });
  } catch (error) {
    console.error("Sign-in identity lookup failed:", error);
    return { ok: false, reason: SIGN_IN_REJECTIONS.LOOKUP_FAILED };
  }

  // A deactivated account cannot sign in again and it is never reactivated by
  // the roster. Only an administrator can lift a deactivation, and that is a
  // separate and explicit action.
  if (existing?.deactivatedAt) {
    return { ok: false, reason: SIGN_IN_REJECTIONS.ACCOUNT_DEACTIVATED };
  }

  const rosterEntry = await findRosterEntry(db, normalizedEmail);

  if (!existing) {
    const decision = decideRosterApproval({
      approvalStatus: null,
      decisionSource: null,
      rosterEntry,
    });

    // The account and its audit event are written in one transaction. An
    // account that is created without its audit event would never be visible
    // in the trail of the unit.
    const created = await runInTransaction(db, async (tx) => {
      const user = await tx.user.create({
        data: {
          name: String(name ?? "").trim() || rosterEntry?.fullName || "Cadet",
          email: normalizedEmail,
          password: null,
          role: "CADET",
          image: image ?? null,
          approvalStatus: decision.approvalStatus,
          ...decisionSourceData(decision.decisionSource, decisionSourceAvailable),
          approvedAt: decision.approvalStatus === "APPROVED" ? clock() : null,
          approvedById: null,
          rejectionReason: null,
          emailVerifiedAt: clock(),
          rosterId: rosterEntry?.id ?? null,
        },
        select,
      });

      await writeAudit(tx, {
        userId: user.id,
        action: decision.autoApproved
          ? "ACCOUNT_CREATED_ROSTER_APPROVED"
          : "ACCOUNT_CREATED",
        entity: "User",
        entityId: user.id,
        oldData: null,
        newData: {
          email: user.email,
          role: user.role,
          approvalStatus: user.approvalStatus,
          decisionSource: decision.decisionSource,
          source: decision.autoApproved ? "ROSTER" : "DEFAULT",
        },
      });

      // The roster pre-fills the roster controlled fields of the profile. The
      // cadet controlled fields stay empty and are completed by the cadet.
      // The profile and its audit event are part of the same transaction as
      // the account, so an account never exists without its profile.
      if (rosterEntry) {
        await syncProfileFromRoster(tx, { user, rosterRow: rosterEntry });
      }

      return user;
    });

    return {
      ok: true,
      user: created,
      source: decision.decisionSource,
      autoApproved: decision.autoApproved,
    };
  }

  const previousSource = effectiveDecisionSource(existing);

  const decision = decideRosterApproval({
    approvalStatus: existing.approvalStatus,
    decisionSource: previousSource,
    rosterEntry,
  });

  // The decision of an administrator is authoritative. An account that an
  // administrator put back into PENDING is never approved automatically by a
  // later sign in, whatever the roster says.
  const shouldApprove = decision.autoApproved;

  const needsVerificationStamp = !existing.emailVerifiedAt;

  // The roster keeps the roster controlled fields of the profile up to date.
  // It never changes the approval state and never touches the fields that
  // the cadet owns.
  await syncProfileWithRoster(db, { user: existing, rosterEntry });

  if (!shouldApprove && !needsVerificationStamp) {
    return {
      ok: true,
      user: existing,
      source: decision.decisionSource,
      autoApproved: false,
    };
  }

  const data = {};

  if (shouldApprove) {
    data.approvalStatus = "APPROVED";
    data.approvedAt = clock();
    data.approvedById = null;
    data.rejectionReason = null;
    data.rosterId = rosterEntry?.id ?? existing.rosterId ?? null;
    Object.assign(
      data,
      decisionSourceData("AUTOMATIC", decisionSourceAvailable)
    );
  }

  if (needsVerificationStamp) {
    data.emailVerifiedAt = clock();
  }

  const updated = await runInTransaction(db, async (tx) => {
    const user = await tx.user.update({
      where: { id: existing.id },
      data,
      select,
    });

    if (shouldApprove) {
      await writeAudit(tx, {
        userId: user.id,
        action: "ACCOUNT_APPROVED_FROM_ROSTER",
        entity: "User",
        entityId: user.id,
        oldData: {
          approvalStatus: existing.approvalStatus,
          decisionSource: previousSource,
        },
        newData: {
          approvalStatus: user.approvalStatus,
          decisionSource: "AUTOMATIC",
          source: "ROSTER",
        },
      });
    }

    return user;
  });

  return {
    ok: true,
    user: updated,
    source: decision.decisionSource,
    autoApproved: shouldApprove,
  };
}

/**
 * Sets the authoritative approval state of an account. Only an approved
 * administrator may call it. The legacy `CadetProfile.status` mirror is
 * updated by a database trigger, never written from here.
 *
 * The state of the account, the origin of the decision and the audit event
 * are written in one transaction. A decision of an administrator is never
 * applied without its audit event and the mirror of the profile can never
 * disagree with the authoritative state.
 *
 * @param {any} db
 * @param {{
 *   targetUserId: string,
 *   status: string,
 *   actorId?: string | null,
 *   rejectionReason?: string | null,
 *   regiNumber?: string,
 *   now?: () => Date,
 * }} input
 * @returns {Promise<AccountRecord>}
 */
export async function setApprovalStatus(
  db,
  {
    targetUserId,
    status,
    actorId,
    rejectionReason = null,
    regiNumber,
    now: clock = now,
  }
) {
  const normalizedStatus = normalizeApprovalStatus(status);

  if (!normalizedStatus) {
    const error = new Error("Unsupported approval status");
    error.statusCode = 400;
    throw error;
  }

  if (!targetUserId || typeof targetUserId !== "string") {
    const error = new Error("A target user id is required");
    error.statusCode = 400;
    throw error;
  }

  const decisionSourceAvailable = await decisionSourceColumnAvailable(db);
  const select = userSelect(decisionSourceAvailable);

  return runInTransaction(db, async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: targetUserId },
      select,
    });

    if (!target) {
      const error = new Error("Account not found");
      error.statusCode = 404;
      throw error;
    }

    // A deactivated account keeps its approval state. An approval does not
    // reactivate it, because lifting a deactivation is an explicit action of
    // an administrator and it is audited on its own.
    if (target.deactivatedAt && normalizedStatus === "APPROVED") {
      const error = new Error(
        "A deactivated account cannot be approved. Reactivate the account first."
      );
      error.statusCode = 409;
      throw error;
    }

    const previousSource = effectiveDecisionSource(target);

    const data = {
      approvalStatus: normalizedStatus,
      approvedAt: normalizedStatus === "APPROVED" ? clock() : null,
      approvedById: actorId ?? null,
      rejectionReason:
        normalizedStatus === "REJECTED" ? rejectionReason ?? null : null,
      // The decision of an administrator is authoritative. The source is
      // recorded so that the automatic path never overwrites it.
      ...decisionSourceData("ADMINISTRATOR", decisionSourceAvailable),
    };

    const updated = await tx.user.update({
      where: { id: targetUserId },
      data,
      select,
    });

    if (typeof regiNumber === "string" && regiNumber.trim().length > 0) {
      await tx.cadetProfile.updateMany({
        where: { userId: targetUserId },
        data: { regiNumber: regiNumber.trim() },
      });
    }

    await writeAudit(tx, {
      userId: actorId ?? null,
      action: `ACCOUNT_${normalizedStatus}`,
      entity: "User",
      entityId: targetUserId,
      oldData: {
        approvalStatus: target.approvalStatus,
        decisionSource: previousSource,
      },
      newData: {
        approvalStatus: normalizedStatus,
        decisionSource: "ADMINISTRATOR",
      },
    });

    return updated;
  });
}

/**
 * Deactivates an account instead of deleting it.
 *
 * The account row, its attendance rows, its leave requests, its profile and
 * its audit history all stay in the database, and every historical record
 * keeps its original owner. The account simply cannot be used any more: the
 * server reads the deactivation on every request.
 *
 * The deactivation and its audit event are written in one transaction, so the
 * audit trail can never miss a deactivation.
 *
 * @param {any} db
 * @param {{
 *   targetUserId: string,
 *   actorId: string,
 *   reason?: string | null,
 *   now?: () => Date,
 * }} input
 * @returns {Promise<{ user: AccountRecord, alreadyDeactivated: boolean }>}
 */
export async function deactivateAccount(
  db,
  { targetUserId, actorId, reason = null, now: clock = now }
) {
  if (!targetUserId || typeof targetUserId !== "string") {
    throw accountError("A target user id is required", 400);
  }

  if (!actorId || typeof actorId !== "string") {
    throw accountError("The acting administrator is required", 400);
  }

  // An administrator locks themselves out of the portal with one click and
  // cannot undo it from inside the portal any more.
  if (targetUserId === actorId) {
    throw accountError(
      "An administrator cannot deactivate their own account",
      409
    );
  }

  return runInTransaction(db, async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: targetUserId },
      select: USER_SELECT_BASE,
    });

    if (!target) {
      throw accountError("Account not found", 404);
    }

    // The call is idempotent. An account that is already deactivated is
    // reported as such and nothing is written a second time.
    if (target.deactivatedAt) {
      return { user: target, alreadyDeactivated: true };
    }

    // The unit always needs one administrator who can sign in.
    if (target.role === "ADMIN") {
      const activeAdministrators = await tx.user.count({
        where: { role: "ADMIN", deactivatedAt: null },
      });

      if (activeAdministrators <= 1) {
        throw accountError(
          "The last active administrator cannot be deactivated",
          409
        );
      }
    }

    const deactivatedAt = clock();
    const cleanReason =
      typeof reason === "string" && reason.trim().length > 0
        ? reason.trim().slice(0, MAX_DEACTIVATION_REASON_LENGTH)
        : null;

    const updated = await tx.user.update({
      where: { id: targetUserId },
      data: {
        deactivatedAt,
        deactivatedById: actorId,
        deactivationReason: cleanReason,
      },
      select: USER_SELECT_BASE,
    });

    await writeAudit(tx, {
      userId: actorId,
      action: "ACCOUNT_DEACTIVATED",
      entity: "User",
      entityId: targetUserId,
      oldData: { deactivatedAt: null },
      newData: {
        deactivatedAt,
        role: target.role,
        approvalStatus: target.approvalStatus,
        reason: cleanReason,
      },
    });

    return { user: updated, alreadyDeactivated: false };
  });
}

/**
 * Lifts the deactivation of an account.
 *
 * The approval state of the account is not touched by this action. An account
 * that was deactivated while it was pending stays pending until an
 * administrator approves it.
 *
 * @param {any} db
 * @param {{
 *   targetUserId: string,
 *   actorId: string,
 * }} input
 * @returns {Promise<{ user: AccountRecord, alreadyActive: boolean }>}
 */
export async function reactivateAccount(db, { targetUserId, actorId }) {
  if (!targetUserId || typeof targetUserId !== "string") {
    throw accountError("A target user id is required", 400);
  }

  if (!actorId || typeof actorId !== "string") {
    throw accountError("The acting administrator is required", 400);
  }

  return runInTransaction(db, async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: targetUserId },
      select: USER_SELECT_BASE,
    });

    if (!target) {
      throw accountError("Account not found", 404);
    }

    if (!target.deactivatedAt) {
      return { user: target, alreadyActive: true };
    }

    const updated = await tx.user.update({
      where: { id: targetUserId },
      data: {
        deactivatedAt: null,
        deactivatedById: null,
        deactivationReason: null,
      },
      select: USER_SELECT_BASE,
    });

    await writeAudit(tx, {
      userId: actorId,
      action: "ACCOUNT_REACTIVATED",
      entity: "User",
      entityId: targetUserId,
      oldData: {
        deactivatedAt: target.deactivatedAt,
        deactivationReason: target.deactivationReason,
      },
      newData: { deactivatedAt: null, role: target.role },
    });

    return { user: updated, alreadyActive: false };
  });
}
