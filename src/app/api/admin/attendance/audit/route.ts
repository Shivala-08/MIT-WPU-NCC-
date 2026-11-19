import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  describeAuditEvent,
  listAuditEvents,
} from "@/lib/audit-service.mjs";
import { parseDateQuery, queryString, serviceErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  const authz = await authorize(["ADMIN"]);

  if (!authz.ok) {
    return authz.response;
  }

  const entity = queryString(req, "entity");
  const action = queryString(req, "action");
  const from = parseDateQuery(queryString(req, "from"));
  const to = parseDateQuery(queryString(req, "to"));
  const take = queryString(req, "take");
  const skip = queryString(req, "skip");

  if (from === undefined || to === undefined) {
    return NextResponse.json(
      { error: "The from and to filters have to use the YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  try {
    const result = await listAuditEvents(prisma, {
      entity,
      action,
      from,
      to,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });

    return NextResponse.json({
      events: result.events.map((event) => ({
        ...event,
        summary: describeAuditEvent(event),
      })),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      entities: AUDIT_ENTITIES,
      actions: AUDIT_ACTIONS,
    });
  } catch (error) {
    return serviceErrorResponse(error, "The audit history could not be loaded");
  }
}
