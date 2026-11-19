import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { serviceErrorResponse } from "@/lib/http";

export async function GET() {
  const authz = await authorize(["CADET"]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const sessions = await prisma.attendanceSession.findMany({
      where: { status: { in: ["OPEN", "CLOSED"] } },
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
      orderBy: [{ date: "asc" }, { startsAt: "asc" }],
      take: 100,
    });

    const now = Date.now();

    // A session is open while the officer keeps it open. It is upcoming when
    // it has not finished yet. A session of the past is not listed again.
    const open = sessions.filter((session) => session.status === "OPEN");

    const upcoming = sessions.filter((session) => {
      if (session.status === "OPEN") {
        return false;
      }

      const reference = session.endsAt ?? session.startsAt;

      if (!reference) {
        return false;
      }

      return new Date(reference).getTime() >= now;
    });

    return NextResponse.json({ open, upcoming });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The sessions could not be loaded"
    );
  }
}
