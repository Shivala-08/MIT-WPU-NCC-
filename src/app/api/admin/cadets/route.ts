import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const wing = searchParams.get("wing");
  const query = searchParams.get("q");

  try {
    const where: any = {};
    if (status && status !== "ALL") {
      where.cadetProfile = { status };
    }
    if (wing && wing !== "ALL") {
      where.cadetProfile = { ...(where.cadetProfile || {}), wing };
    }

    const cadets = await prisma.user.findMany({
      where: {
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
        ...where,
      },
      include: {
        cadetProfile: true,
        attendances: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(cadets);
  } catch (error) {
    console.error("Failed to fetch cadets:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
