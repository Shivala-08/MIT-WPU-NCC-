import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const authz = await authorize(["ADMIN", "OFFICER"]);
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const sessions = await prisma.attendanceSession.findMany({
      include: {
        attendances: {
          include: {
            user: {
              include: { cadetProfile: true },
            },
          },
        },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Attendance fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authz = await authorize(["ADMIN", "OFFICER"]);
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = await req.json();
    const { title, type, date, startTime, endTime, marks } = body;

    if (!title || !type || !date) {
      return NextResponse.json(
        { error: "Title, type, and date are required" },
        { status: 400 }
      );
    }

    // Create session and attendance records in transaction
    const newSession = await prisma.attendanceSession.create({
      data: {
        title,
        type,
        date: new Date(date),
        startTime: startTime || null,
        endTime: endTime || null,
        attendances: {
          create: marks.map((m: { userId: string; status: string }) => ({
            userId: m.userId,
            status: m.status || "PRESENT",
          })),
        },
      },
      include: {
        attendances: true,
      },
    });

    return NextResponse.json({ success: true, session: newSession }, { status: 201 });
  } catch (error) {
    console.error("Attendance creation error:", error);
    return NextResponse.json({ error: "Failed to log attendance" }, { status: 500 });
  }
}
