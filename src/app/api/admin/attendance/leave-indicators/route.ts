import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { canManageSessions } from "@/lib/attendance-permissions.mjs";
import { parseDateQuery, queryString, serviceErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canManageSessions(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = parseDateQuery(queryString(req, "from"));
  const to = parseDateQuery(queryString(req, "to"));

  if (from === undefined || to === undefined) {
    return NextResponse.json(
      { error: "The from and to filters have to use the YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  try {
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        ...(from ? { endDate: { gte: new Date(`${from}T00:00:00.000Z`) } } : {}),
        ...(to ? { startDate: { lte: new Date(`${to}T23:59:59.999Z`) } } : {}),
      },
      select: {
        id: true,
        userId: true,
        type: true,
        startDate: true,
        endDate: true,
        status: true,
      },
      orderBy: { startDate: "asc" },
      take: 500,
    });

    return NextResponse.json({
      leaves: leaves.map((leave) => ({
        id: leave.id,
        userId: leave.userId,
        type: leave.type,
        startDate: leave.startDate.toISOString(),
        endDate: leave.endDate.toISOString(),
      })),
    });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The approved leave could not be loaded"
    );
  }
}
