import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Role } from "@/lib/roles";
import type { ApprovalStatus } from "@/lib/approval";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  image: string | null;
  approvalStatus: ApprovalStatus;
  /**
   * The moment the account was deactivated, or null while it is active.
   *
   * A deactivated account keeps its approval state and its history. It is
   * blocked everywhere, so the server reads this column on every request.
   */
  deactivatedAt: Date | null;
  /**
   * Whether the roster row of the account is operationally active.
   *
   * An inactive roster row only blocks the operational attendance of the
   * cadet. It never changes the approval state, it never deactivates the
   * account and it never removes the profile, the attendance or the leave
   * history. An account without a roster row is not blocked by the roster.
   */
  rosterActive: boolean;
};

/**
 * An account may use the portal only when it is approved and not deactivated.
 *
 * The rule lives here so that the pages and the API routes cannot disagree
 * about what an active account is.
 */
export function isApprovedAccount(
  user: Pick<SessionUser, "approvalStatus" | "deactivatedAt"> | null | undefined
): boolean {
  if (!user) {
    return false;
  }

  return user.approvalStatus === "APPROVED" && !user.deactivatedAt;
}

/**
 * An account may take part in the attendance operations only when it is
 * approved, not deactivated and its roster row is active.
 *
 * The roster row is read on every request, so a cadet that an administrator
 * removed from the roster stops appearing on the rolls of the unit at once.
 */
export function isAttendanceEligibleAccount(
  user:
    | Pick<SessionUser, "approvalStatus" | "deactivatedAt" | "rosterActive">
    | null
    | undefined
): boolean {
  if (!isApprovedAccount(user)) {
    return false;
  }

  return user?.rosterActive !== false;
}

/**
 * Reads the current user from the database on every request.
 *
 * The session cookie only carries an identity. The role, the approval state
 * and the deactivation state are always read from the database so a stale
 * token can neither grant nor deny access.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;

  if (!id) {
    return null;
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        approvalStatus: true,
        deactivatedAt: true,
        // The state of the roster row decides whether the cadet may take part
        // in the attendance operations. It is read on every request.
        roster: { select: { active: true } },
      },
    });

    if (!dbUser) {
      return null;
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      image: dbUser.image,
      approvalStatus: dbUser.approvalStatus,
      deactivatedAt: dbUser.deactivatedAt,
      rosterActive: dbUser.roster?.active !== false,
    };
  } catch (error) {
    console.error("Session user lookup failed:", error);
    return null;
  }
}

export type AuthorizeResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Server side authorization for every protected API route.
 *
 * An anonymous caller gets 401, a deactivated account gets 403 with the
 * deactivation code, an account that is not approved gets 403 with the
 * authoritative approval state, and a caller with the wrong role gets 403.
 */
export async function authorize(
  allowedRoles: Role[]
): Promise<AuthorizeResult> {
  const user = await getSessionUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (user.deactivatedAt) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Account deactivated",
          code: "DEACTIVATED",
        },
        { status: 403 }
      ),
    };
  }

  if (user.approvalStatus !== "APPROVED") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            user.approvalStatus === "REJECTED"
              ? "Account rejected"
              : "Account pending approval",
          code: user.approvalStatus,
        },
        { status: 403 }
      ),
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}
