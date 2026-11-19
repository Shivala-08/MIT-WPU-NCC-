import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { transitionSession } from "@/lib/attendance-service.mjs";
import {
  canAdministerSessions,
  canManageSessions,
} from "@/lib/attendance-permissions.mjs";
import { readJsonBody, serviceErrorResponse } from "@/lib/http";

export async function handleSessionAction(
  req: Request,
  { id }: { id: string },
  action: "open" | "close" | "cancel"
) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canManageSessions(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "cancel" && !canAdministerSessions(authz.user.role)) {
    return NextResponse.json(
      { error: "Only an administrator can cancel a session" },
      { status: 403 }
    );
  }

  try {
    let reason: string | undefined;

    try {
      const body = await readJsonBody(req, 8_000);
      reason = typeof body?.reason === "string" ? body.reason : undefined;
    } catch {
      reason = undefined;
    }

    const session = await transitionSession(prisma, {
      actor: authz.user,
      sessionId: id,
      action,
      reason,
    });

    return NextResponse.json({ session });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The session could not be changed"
    );
  }
}
