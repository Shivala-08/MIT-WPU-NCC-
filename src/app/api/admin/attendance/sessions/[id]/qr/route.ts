import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import {
  generateQrToken,
  getActiveQrToken,
  revokeQrTokens,
} from "@/lib/attendance-service.mjs";
import { canManageSessions } from "@/lib/attendance-permissions.mjs";
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
    const token = await getActiveQrToken(prisma, id);

    if (!token) {
      return NextResponse.json({ active: false });
    }

    return NextResponse.json({
      active: true,
      expiresAt: token.expiresAt,
    });
  } catch (error) {
    return serviceErrorResponse(error, "The check-in code could not be read");
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

    const generated = await generateQrToken(prisma, {
      actor: authz.user,
      sessionId: id,
      ttlMinutes,
    });

    const qrDataUrl = await QRCode.toDataURL(generated.token, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: { dark: "#0b1f3a", light: "#ffffff" },
    });

    return NextResponse.json({
      token: generated.token,
      expiresAt: generated.expiresAt,
      qrDataUrl,
    });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The check-in code could not be created"
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
    const result = await revokeQrTokens(prisma, {
      actor: authz.user,
      sessionId: id,
    });

    return NextResponse.json({ success: true, revoked: result.revoked });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The check-in code could not be revoked"
    );
  }
}
