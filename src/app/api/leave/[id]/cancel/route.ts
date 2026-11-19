import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { cancelLeave, serializeLeave } from "@/lib/leave-service.mjs";
import { serviceErrorResponse } from "@/lib/http";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorize(["CADET"]);

  if (!authz.ok) {
    return authz.response;
  }

  const { id } = await params;

  try {
    const request = await cancelLeave(prisma, {
      actor: authz.user,
      id,
    });

    return NextResponse.json({ request: serializeLeave(request) });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "The leave request could not be cancelled"
    );
  }
}
