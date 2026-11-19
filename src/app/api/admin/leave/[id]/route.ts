import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { readLeave, reviewLeave, serializeLeave } from "@/lib/leave-service.mjs";
import {
  canReadLeaveQueue,
  canReviewLeave,
} from "@/lib/attendance-permissions.mjs";
import { readJsonBody, serviceErrorResponse } from "@/lib/http";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canReadLeaveQueue(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const request = await readLeave(prisma, { id });

    if (!request) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ request: serializeLeave(request) });
  } catch (error) {
    return serviceErrorResponse(error, "The leave request could not be loaded");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canReviewLeave(authz.user.role)) {
    // The policy is administrator only. The buttons are hidden for the
    // officers, but the decision is refused here as well.
    return NextResponse.json(
      { error: "Only an administrator can decide a leave request" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const body = await readJsonBody(req);
    const request = await reviewLeave(prisma, {
      actor: authz.user,
      id,
      decision: body?.decision,
      reason: body?.reason,
    });

    return NextResponse.json({ request: serializeLeave(request) });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The leave request could not be decided"
    );
  }
}
