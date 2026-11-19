import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import {
  checkInWithManualCode,
  checkInWithToken,
  hashManualCode,
  isManualCodeFormat,
  manualCodePepper,
} from "@/lib/attendance-service.mjs";
import {
  checkInLimiter,
  manualCodeLimiter,
  manualCodeSessionLimiter,
} from "@/lib/rate-limit.mjs";
import { readJsonBody, serviceErrorResponse } from "@/lib/http";

export async function POST(req: Request) {
  const authz = await authorize(["CADET"]);

  if (!authz.ok) {
    return authz.response;
  }

  const limit = await checkInLimiter(`attendance-check-in:${authz.user.id}`);

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Too many check-in attempts. Try again in a moment.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  try {
    const body = await readJsonBody(req, 8_000);

    // A six digit code is the manual fallback. Everything else is the QR
    // token. The cadet identity always comes from the session.
    const isManualCode = isManualCodeFormat(body?.code);

    if (isManualCode) {
      const codeLimit = await manualCodeLimiter(
        `attendance-manual-code:${authz.user.id}`
      );

      if (!codeLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "Too many code attempts. Wait a few minutes before trying again.",
            retryAfterSeconds: codeLimit.retryAfterSeconds,
          },
          { status: 429 }
        );
      }

      // The limit of a session stops one cadet from brute forcing the code of
      // a session with many accounts.
      const stored = await prisma.attendanceManualCode.findUnique({
        where: { codeHash: hashManualCode(body.code, manualCodePepper()) },
        select: { sessionId: true },
      });

      if (stored) {
        const sessionLimit = await manualCodeSessionLimiter(
          `attendance-manual-code-session:${stored.sessionId}`
        );

        if (!sessionLimit.allowed) {
          return NextResponse.json(
            {
              error:
                "Too many code attempts for this session. Ask the officer for a new code.",
              retryAfterSeconds: sessionLimit.retryAfterSeconds,
            },
            { status: 429 }
          );
        }
      }
    }

    const result = isManualCode
      ? await checkInWithManualCode(prisma, {
          actor: authz.user,
          code: body.code,
        })
      : await checkInWithToken(prisma, {
          actor: authz.user,
          token: body?.token,
        });

    return NextResponse.json({
      success: true,
      duplicate: result.duplicate,
      method: isManualCode ? "MANUAL_CODE" : "QR",
      session: result.session,
      record: {
        id: result.record.id,
        status: result.record.status,
        method: result.record.method,
        markedAt: result.record.markedAt,
      },
    });
  } catch (error) {
    return serviceErrorResponse(error, "The check-in could not be completed");
  }
}
