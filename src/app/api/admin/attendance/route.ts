import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { USER_PASSWORD_OMIT } from "@/lib/user-fields.mjs";

const ALLOWED_ATTENDANCE_STATUSES = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "ON_DUTY",
  "LEAVE",
  "EXCUSED",
];

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
              omit: USER_PASSWORD_OMIT,
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

    if (!Array.isArray(marks) || marks.length === 0) {
      return NextResponse.json(
        { error: "At least one cadet mark is required" },
        { status: 400 }
      );
    }

    const normalizedMarks = marks.map(
      (mark: { userId?: unknown; status?: unknown }) => ({
        userId: mark?.userId,
        status: String(mark?.status ?? "PRESENT").toUpperCase(),
      })
    );

    if (
      normalizedMarks.some(
        (mark) => typeof mark.userId !== "string" || mark.userId.length === 0
      )
    ) {
      return NextResponse.json(
        { error: "Every mark needs a valid user id" },
        { status: 400 }
      );
    }

    const requestedIds = [
      ...new Set(normalizedMarks.map((mark) => mark.userId as string)),
    ];

    if (requestedIds.length !== normalizedMarks.length) {
      return NextResponse.json(
        { error: "A cadet can only be marked once per session" },
        { status: 400 }
      );
    }

    const statuses = normalizedMarks.map((mark) => mark.status);

    const unsupportedStatus = statuses.find(
      (status) => !ALLOWED_ATTENDANCE_STATUSES.includes(status)
    );

    if (unsupportedStatus) {
      return NextResponse.json(
        { error: `Unsupported attendance status: ${unsupportedStatus}` },
        { status: 400 }
      );
    }

    // Attendance may only be recorded for cadets whose account is approved.
    const eligible = await prisma.user.findMany({
      where: {
        id: { in: requestedIds },
        role: "CADET",
        approvalStatus: "APPROVED",
      },
      select: { id: true },
    });

    const eligibleIds = new Set(eligible.map((cadet) => cadet.id));
    const ineligible = requestedIds.filter((id) => !eligibleIds.has(id));

    if (ineligible.length > 0) {
      return NextResponse.json(
        {
          error:
            "Attendance can only be recorded for cadets with an approved account",
        },
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
          create: normalizedMarks.map((mark) => ({
            userId: mark.userId as string,
            status: mark.status,
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
