import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { listLeaves, serializeLeave } from "@/lib/leave-service.mjs";
import { canReadLeaveQueue } from "@/lib/attendance-permissions.mjs";
import { queryString, serviceErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canReadLeaveQueue(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = queryString(req, "status");

  try {
    const requests = await listLeaves(prisma, {
      status: status ?? undefined,
      take: 100,
    });

    return NextResponse.json({
      requests: requests.map((request) => serializeLeave(request)),
    });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The leave requests could not be loaded"
    );
  }
}
