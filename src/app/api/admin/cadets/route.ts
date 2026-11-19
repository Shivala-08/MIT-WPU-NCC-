import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { isApprovalStatus } from "@/lib/approval";
import {
  deactivateAccount,
  reactivateAccount,
  setApprovalStatus,
} from "@/lib/account-service.mjs";
import {
  USER_OMIT,
  stripPassword,
  stripPasswordFromRecords,
} from "@/lib/user-fields.mjs";

/**
 * Maps an error of the account service to a status code and a message that
 * never exposes the internals of the database.
 */
function accountErrorResponse(error: unknown) {
  const code =
    typeof (error as { code?: unknown })?.code === "string"
      ? (error as { code: string }).code
      : null;

  const statusCode =
    typeof (error as { statusCode?: number })?.statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 500;

  if (code === "P2003") {
    // A record of the account still points at it. The account is not deleted,
    // so this is only a safety net.
    return NextResponse.json(
      { error: "The account is still referenced by records that cannot be removed" },
      { status: 409 }
    );
  }

  if (statusCode === 404) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (statusCode === 409 || statusCode === 400) {
    return NextResponse.json(
      {
        error:
          (error as { message?: string })?.message ??
          "The account could not be changed",
      },
      { status: statusCode }
    );
  }

  console.error("Failed to change the account:", error);

  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

export async function GET(req: Request) {
  const authz = await authorize(["ADMIN"]);
  if (!authz.ok) {
    return authz.response;
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const wing = searchParams.get("wing");
  const query = searchParams.get("q");

  try {
    const cadetProfile: Prisma.CadetProfileWhereInput = {};
    const where: Prisma.UserWhereInput = { role: "CADET" };

    if (status && status !== "ALL") {
      if (isApprovalStatus(status)) {
        where.approvalStatus = status;
      } else {
        cadetProfile.status = status;
      }
    }

    if (wing && wing !== "ALL") {
      cadetProfile.wing = wing;
    }

    if (query) {
      where.OR = [
        { name: { contains: query } },
        { email: { contains: query } },
        { cadetProfile: { regiNumber: { contains: query } } },
      ];
    }

    if (Object.keys(cadetProfile).length > 0) {
      where.cadetProfile = cadetProfile;
    }

    const cadets = await prisma.user.findMany({
      where,
      omit: USER_OMIT,
      include: {
        cadetProfile: true,
        attendances: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(stripPasswordFromRecords(cadets));
  } catch (error) {
    console.error("Failed to fetch cadets:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const authz = await authorize(["ADMIN"]);
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = await req.json();
    const { userId, status, rejectionReason, regiNumber, deactivated } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID and status are required" },
        { status: 400 }
      );
    }

    // Lifting a deactivation is an explicit action of its own. It never
    // changes the approval state of the account.
    if (deactivated === false) {
      const { user, alreadyActive } = await reactivateAccount(prisma, {
        targetUserId: userId,
        actorId: authz.user.id,
      });

      return NextResponse.json({
        success: true,
        alreadyActive,
        user: stripPassword(user),
        message: alreadyActive
          ? "This account was already active."
          : "The account is active again.",
      });
    }

    if (!status) {
      return NextResponse.json(
        { error: "User ID and status are required" },
        { status: 400 }
      );
    }

    if (!isApprovalStatus(status)) {
      return NextResponse.json(
        { error: "Status must be PENDING, APPROVED or REJECTED" },
        { status: 400 }
      );
    }

    const updatedUser = await setApprovalStatus(prisma, {
      targetUserId: userId,
      status,
      actorId: authz.user.id,
      rejectionReason:
        typeof rejectionReason === "string" ? rejectionReason : null,
      regiNumber: typeof regiNumber === "string" ? regiNumber : undefined,
    });

    return NextResponse.json({
      success: true,
      user: stripPassword(updatedUser),
    });
  } catch (error) {
    const statusCode =
      typeof (error as { statusCode?: number })?.statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;

    if (statusCode === 500) {
      console.error("Failed to update account approval status:", error);
    }

    return NextResponse.json(
      {
        error:
          statusCode === 404
            ? "Account not found"
            : statusCode === 400
            ? "Invalid approval request"
            : statusCode === 409
            ? (error as { message?: string })?.message ?? "Update failed"
            : "Update failed",
      },
      { status: statusCode }
    );
  }
}

/**
 * Deactivates an account.
 *
 * The account is not deleted. The row, the attendance rows, the leave
 * requests, the profile and the audit history stay in the database, so the
 * historical record of the unit stays complete. The account cannot sign in
 * and it cannot use the protected parts of the portal any more.
 */
export async function DELETE(req: Request) {
  const authz = await authorize(["ADMIN"]);
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const reason = searchParams.get("reason");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const { user, alreadyDeactivated } = await deactivateAccount(prisma, {
      targetUserId: userId,
      actorId: authz.user.id,
      reason,
    });

    return NextResponse.json({
      success: true,
      alreadyDeactivated,
      deactivatedAt: user.deactivatedAt,
      message: alreadyDeactivated
        ? "This account was already deactivated."
        : "The account is deactivated. The attendance history, the leave requests and the profile are kept.",
    });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
