import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import {
  getSession,
  summarizeSession,
  updateSession,
} from "@/lib/attendance-service.mjs";
import { canAdministerSessions } from "@/lib/attendance-permissions.mjs";
import { readJsonBody, serviceErrorResponse } from "@/lib/http";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  const { id } = await params;

  try {
    const session = await getSession(prisma, id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      session,
      totals: summarizeSession(session.attendances),
    });
  } catch (error) {
    return serviceErrorResponse(error, "The session could not be loaded");
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

  if (!canAdministerSessions(authz.user.role)) {
    return NextResponse.json(
      { error: "Only an administrator can edit a session" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const body = await readJsonBody(req);
    const session = await updateSession(prisma, {
      actor: authz.user,
      sessionId: id,
      values: body,
    });

    return NextResponse.json({ session });
  } catch (error) {
    return serviceErrorResponse(error, "The session could not be updated");
  }
}
