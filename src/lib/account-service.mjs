import {
  decideRosterApproval,
  isAllowedCollegeEmail,
  normalizeEmail,
} from "./eligibility.mjs";
import { syncProfileFromRoster } from "./profile-service.mjs";

/**
 * @typedef {import("./eligibility.mjs").ApprovalStatus} ApprovalStatus
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   email: string,
 *   role: string,
 *   image: string | null,
 *   approvalStatus: ApprovalStatus,
 *   approvedAt: Date | null,
 *   approvedById: string | null,
 *   rejectionReason: string | null,
 *   emailVerifiedAt: Date | null,
 *   rosterId: string | null,
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
  LOOKUP_FAILED: "LOOKUP_FAILED",
});

const USER_SELECT = {
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
};

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
 * @param {any} db
 * @param {any} entry
 * @returns {Promise<void>}
 */
async function writeAudit(db, entry) {
  if (!db.auditLog || typeof db.auditLog.create !== "function") {
    return;
  }

  await db.auditLog.create({ data: entry });
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
 *   | { ok: true, user: AccountRecord, source: "EXISTING" | "ROSTER" | "DEFAULT" }
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

  let existing = null;

  try {
    existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: USER_SELECT,
    });
  } catch (error) {
    console.error("Sign-in identity lookup failed:", error);
    return { ok: false, reason: SIGN_IN_REJECTIONS.LOOKUP_FAILED };
  }

  const rosterEntry = await findRosterEntry(db, normalizedEmail);

  if (!existing) {
    const decision = decideRosterApproval({
      approvalStatus: null,
      rosterEntry,
    });

    const created = await db.user.create({
      data: {
        name: String(name ?? "").trim() || rosterEntry?.fullName || "Cadet",
        email: normalizedEmail,
        password: null,
        role: "CADET",
        image: image ?? null,
        approvalStatus: decision.approvalStatus,
        approvedAt: decision.approvalStatus === "APPROVED" ? clock() : null,
        approvedById: null,
        rejectionReason: null,
        emailVerifiedAt: clock(),
        rosterId: rosterEntry?.id ?? null,
      },
      select: USER_SELECT,
    });

    await writeAudit(db, {
      userId: created.id,
      action: decision.source === "ROSTER" ? "ACCOUNT_CREATED_ROSTER_APPROVED" : "ACCOUNT_CREATED",
      entity: "User",
      entityId: created.id,
      oldData: null,
      newData: {
        email: created.email,
        role: created.role,
        approvalStatus: created.approvalStatus,
        source: decision.source,
      },
    });

    // The roster pre-fills the roster controlled fields of the profile. The
    // cadet controlled fields stay empty and are completed by the cadet.
    await syncProfileWithRoster(db, { user: created, rosterEntry });

    return { ok: true, user: created, source: decision.source };
  }

  const decision = decideRosterApproval({
    approvalStatus: existing.approvalStatus,
    rosterEntry,
  });

  const shouldApprove =
    existing.approvalStatus !== "APPROVED" &&
    decision.approvalStatus === "APPROVED";

  const needsVerificationStamp = !existing.emailVerifiedAt;

  // The roster keeps the roster controlled fields of the profile up to date.
  // It never changes the approval state and never touches the fields that
  // the cadet owns.
  await syncProfileWithRoster(db, { user: existing, rosterEntry });

  if (!shouldApprove && !needsVerificationStamp) {
    return { ok: true, user: existing, source: "EXISTING" };
  }

  const data = {};

  if (shouldApprove) {
    data.approvalStatus = "APPROVED";
    data.approvedAt = clock();
    data.approvedById = null;
    data.rejectionReason = null;
    data.rosterId = rosterEntry?.id ?? existing.rosterId ?? null;
  }

  if (needsVerificationStamp) {
    data.emailVerifiedAt = clock();
  }

  const updated = await db.user.update({
    where: { id: existing.id },
    data,
    select: USER_SELECT,
  });

  if (!shouldApprove) {
    return { ok: true, user: updated, source: "EXISTING" };
  }

  await writeAudit(db, {
    userId: updated.id,
    action: "ACCOUNT_APPROVED_FROM_ROSTER",
    entity: "User",
    entityId: updated.id,
    oldData: { approvalStatus: existing.approvalStatus },
    newData: { approvalStatus: updated.approvalStatus, source: "ROSTER" },
  });

  return { ok: true, user: updated, source: "ROSTER" };
}

/**
 * Sets the authoritative approval state of an account. Only an approved
 * administrator may call it. The legacy `CadetProfile.status` mirror is
 * updated by a database trigger, never written from here.
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
  const normalizedStatus = String(status ?? "").toUpperCase();

  if (!["PENDING", "APPROVED", "REJECTED"].includes(normalizedStatus)) {
    const error = new Error("Unsupported approval status");
    error.statusCode = 400;
    throw error;
  }

  if (!targetUserId || typeof targetUserId !== "string") {
    const error = new Error("A target user id is required");
    error.statusCode = 400;
    throw error;
  }

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: USER_SELECT,
  });

  if (!target) {
    const error = new Error("Account not found");
    error.statusCode = 404;
    throw error;
  }

  const data = {
    approvalStatus: normalizedStatus,
    approvedAt: normalizedStatus === "APPROVED" ? clock() : null,
    approvedById: actorId ?? null,
    rejectionReason:
      normalizedStatus === "REJECTED" ? rejectionReason ?? null : null,
  };

  const updated = await db.user.update({
    where: { id: targetUserId },
    data,
    select: USER_SELECT,
  });

  if (typeof regiNumber === "string" && regiNumber.trim().length > 0) {
    await db.cadetProfile.updateMany({
      where: { userId: targetUserId },
      data: { regiNumber: regiNumber.trim() },
    });
  }

  await writeAudit(db, {
    userId: actorId ?? null,
    action: `ACCOUNT_${normalizedStatus}`,
    entity: "User",
    entityId: targetUserId,
    oldData: { approvalStatus: target.approvalStatus },
    newData: { approvalStatus: normalizedStatus },
  });

  return updated;
}
