import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { canManageSessions } from "@/lib/attendance-permissions.mjs";
import { createSession, listSessions } from "@/lib/attendance-service.mjs";
import { parseDateQuery, queryString, readJsonBody, serviceErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  const status = queryString(req, "status");
  const from = parseDateQuery(queryString(req, "from"));
  const to = parseDateQuery(queryString(req, "to"));

  if (from === undefined || to === undefined) {
    return NextResponse.json(
      { error: "The from and to filters have to use the YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  try {
    const sessions = await listSessions(prisma, {
      status: status ?? undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      take: 100,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    return serviceErrorResponse(error, "The sessions could not be loaded");
  }
}

export async function POST(req: Request) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canManageSessions(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await readJsonBody(req);
    const session = await createSession(prisma, {
      actor: authz.user,
      input: body,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error, "The session could not be created");
  }
}
