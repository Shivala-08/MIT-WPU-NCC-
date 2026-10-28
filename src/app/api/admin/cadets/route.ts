import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import {
  USER_PASSWORD_OMIT,
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
    if (status && status !== "ALL") {
      cadetProfile.status = status;
    }
    if (wing && wing !== "ALL") {
      cadetProfile.wing = wing;
    }

    const where: Prisma.UserWhereInput = {
      role: "CADET",
      ...(query
        ? {
            OR: [
              { name: { contains: query } },
              { email: { contains: query } },
              { cadetProfile: { regiNumber: { contains: query } } },
            ],
          }
        : {}),
      ...(Object.keys(cadetProfile).length > 0 ? { cadetProfile } : {}),
    };

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
    const { userId, status, regiNumber } = body;

    if (!userId || !status) {
      return NextResponse.json(
        { error: "User ID and status are required" },
        { status: 400 }
      );
    }

    const updatedProfile = await prisma.cadetProfile.update({
      where: { userId },
      data: {
        status,
        ...(regiNumber !== undefined ? { regiNumber } : {}),
      },
    });

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.error("Failed to update cadet profile:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
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
