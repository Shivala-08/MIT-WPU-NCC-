import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import {
  generateManualCode,
  getActiveManualCode,
  revokeManualCodes,
} from "@/lib/attendance-service.mjs";
import { canManageSessions } from "@/lib/attendance-permissions.mjs";
import { readJsonBody, serviceErrorResponse } from "@/lib/http";

/**
 * The fallback code of one session.
 *
 * The raw code is only returned to the staff of an open session. It is never
 * part of a public API and it is stored as a peppered hash.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canManageSessions(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const stored = await getActiveManualCode(prisma, { sessionId: id });

    if (!stored) {
      return NextResponse.json({ active: false });
    }

    return NextResponse.json({
      active: true,
      expiresAt: stored.expiresAt,
    });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The manual check-in code could not be read"
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canManageSessions(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    let ttlMinutes: number | undefined;

    try {
      const body = await readJsonBody(req, 8_000);
      ttlMinutes =
        body?.ttlMinutes === undefined ? undefined : Number(body.ttlMinutes);
    } catch {
      ttlMinutes = undefined;
    }

    const generated = await generateManualCode(prisma, {
      actor: authz.user,
      sessionId: id,
      ttlMinutes,
    });

    return NextResponse.json({
      code: generated.code,
      expiresAt: generated.expiresAt,
    });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The manual check-in code could not be created"
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canManageSessions(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await revokeManualCodes(prisma, {
      actor: authz.user,
      sessionId: id,
    });

    return NextResponse.json({ success: true, revoked: result.revoked });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The manual check-in code could not be revoked"
    );
  }
}
