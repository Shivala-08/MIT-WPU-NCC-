import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { markAttendance, summarizeSession } from "@/lib/attendance-service.mjs";
import {
  canCorrectClosedSession,
  canManageSessions,
} from "@/lib/attendance-permissions.mjs";
import { bulkMarkLimiter } from "@/lib/rate-limit.mjs";
import { readJsonBody, serviceErrorResponse } from "@/lib/http";
import { MIN_CORRECTION_REASON_LENGTH } from "@/lib/attendance-rules.mjs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canManageSessions(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = await bulkMarkLimiter(`attendance-records:${authz.user.id}`);

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Too many attendance saves in a row. Try again in a moment.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  const { id } = await params;

  try {
    const body = await readJsonBody(req);

    const session = await prisma.attendanceSession.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "CLOSED") {
      // A closed session is read only for the officers. Only an administrator
      // can correct it and the correction always carries a reason.
      if (!canCorrectClosedSession(authz.user.role)) {
        return NextResponse.json(
          { error: "Only an administrator can correct a closed session" },
          { status: 403 }
        );
      }

      const reason =
        typeof body?.reason === "string" ? body.reason.trim() : "";

      if (reason.length < MIN_CORRECTION_REASON_LENGTH) {
        return NextResponse.json(
          {
            error: `A correction on a closed session needs a reason of at least ${MIN_CORRECTION_REASON_LENGTH} characters`,
          },
          { status: 400 }
        );
      }
    }

    const result = await markAttendance(prisma, {
      actor: authz.user,
      sessionId: id,
      marks: body?.marks,
      reason: body?.reason,
    });

    const records = await prisma.attendance.findMany({
      where: { sessionId: id },
    });

    return NextResponse.json({
      success: true,
      created: result.created,
      updated: result.updated,
      totals: summarizeSession(records),
    });
  } catch (error) {
    return serviceErrorResponse(error, "The attendance could not be saved");
  }
}
