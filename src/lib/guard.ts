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
};

/**
 * Reads the current user from the database on every request.
 *
 * The session cookie only carries an identity. The role and the approval
 * state are always read from the database so a stale token can neither grant
 * nor deny access.
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
 * An anonymous caller gets 401, an account that is not approved gets 403 with
 * the authoritative approval state, and a caller with the wrong role gets 403.
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
