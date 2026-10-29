import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { isApprovalStatus } from "@/lib/approval";
import { setApprovalStatus } from "@/lib/account-service.mjs";
import {
  USER_PASSWORD_OMIT,
  stripPassword,
  stripPasswordFromRecords,
} from "@/lib/user-fields.mjs";

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
      omit: USER_PASSWORD_OMIT,
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
    const { userId, status, rejectionReason, regiNumber } = body;

    if (!userId || !status) {
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
            : "Update failed",
      },
      { status: statusCode }
    );
  }
}

export async function DELETE(req: Request) {
  const authz = await authorize(["ADMIN"]);
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete user:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
