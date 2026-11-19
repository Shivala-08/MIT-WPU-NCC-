import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { readPolicy } from "@/lib/attendance-policy.mjs";
import { calculateAttendance } from "@/lib/attendance-calculator";
import { queryString, serviceErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  const authz = await authorize(["CADET"]);

  if (!authz.ok) {
    return authz.response;
  }

  const type = queryString(req, "type");

  try {
    const [sessions, records, policy] = await Promise.all([
      prisma.attendanceSession.findMany({
        where: {
          status: { not: "CANCELLED" },
          ...(type ? { type } : {}),
        },
        select: {
          id: true,
          title: true,
          type: true,
          date: true,
          venue: true,
          startsAt: true,
          endsAt: true,
          status: true,
        },
        orderBy: { date: "desc" },
        take: 200,
      }),
      prisma.attendance.findMany({
        where: { userId: authz.user.id },
        select: {
          id: true,
          sessionId: true,
          status: true,
          method: true,
          note: true,
          markedAt: true,
          session: {
            select: {
              id: true,
              title: true,
              type: true,
              date: true,
              venue: true,
              startsAt: true,
              status: true,
            },
          },
        },
        orderBy: { markedAt: "desc" },
        take: 500,
      }),
      readPolicy(prisma),
    ]);

    const summary = calculateAttendance({
      sessions,
      records,
      policy,
    });

    return NextResponse.json({
      summary,
      records: records.map((record) => ({
        id: record.id,
        status: record.status,
        method: record.method,
        note: record.note,
        markedAt:
          record.markedAt instanceof Date
            ? record.markedAt.toISOString()
            : record.markedAt,
        session: record.session,
      })),
      policy: {
        version: policy.version,
        thresholdPercent: policy.thresholdPercent,
        thresholdConfirmed: policy.thresholdConfirmed,
      },
    });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The attendance history could not be loaded"
    );
  }
}
