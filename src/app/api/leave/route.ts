import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { listOwnLeaves, serializeLeave, submitLeave } from "@/lib/leave-service.mjs";
import { readJsonBody, serviceErrorResponse } from "@/lib/http";

export async function GET() {
  const authz = await authorize(["CADET"]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const requests = await listOwnLeaves(prisma, { userId: authz.user.id });

    return NextResponse.json({
      requests: requests.map((request) => serializeLeave(request)),
    });
  } catch (error) {
    return serviceErrorResponse(error, "The leave requests could not be loaded");
  }
}

export async function POST(req: Request) {
  const authz = await authorize(["CADET"]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = await readJsonBody(req);
    const request = await submitLeave(prisma, {
      actor: authz.user,
      input: body,
    });

    return NextResponse.json(
      { request: serializeLeave(request) },
      { status: 201 }
    );
  } catch (error) {
    return serviceErrorResponse(error, "The leave request could not be sent");
  }
}
