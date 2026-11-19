import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { USER_OMIT } from "@/lib/user-fields.mjs";
import { validateMarks } from "@/lib/attendance-rules.mjs";
import { eligibleCadetWhere } from "@/lib/attendance-eligibility.mjs";
import {
  createSession,
  markAttendance,
  transitionSession,
} from "@/lib/attendance-service.mjs";
import { serviceErrorResponse } from "@/lib/http";

export async function GET(_req: Request) {
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
              omit: USER_OMIT,
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

    const validation = validateMarks(marks);

    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.errors[0]?.message ?? "The marks are not valid" },
        { status: 400 }
      );
    }

    const requestedIds = validation.marks.map((mark) => mark.userId);

    const eligible = await prisma.user.findMany({
      where: eligibleCadetWhere({ id: { in: requestedIds } }),
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

    // The session follows the same lifecycle as every other session. It is
    // created as a draft, opened and only then the roll is marked.
    const session = await createSession(prisma, {
      actor: authz.user,
      input: {
        title,
        activityType: type,
        date,
        startTime,
        endTime,
      },
    });

    const opened = await transitionSession(prisma, {
      actor: authz.user,
      sessionId: session.id,
      action: "open",
    });

    const result = await markAttendance(prisma, {
      actor: authz.user,
      sessionId: session.id,
      marks: validation.marks,
    });

    return NextResponse.json(
      { success: true, session: { ...opened, ...result } },
      { status: 201 }
    );
  } catch (error) {
    return serviceErrorResponse(error, "Failed to log attendance");
  }
}
