import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { readLeave, serializeLeave } from "@/lib/leave-service.mjs";
import { serviceErrorResponse } from "@/lib/http";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorize(["CADET"]);

  if (!authz.ok) {
    return authz.response;
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

    if (request.userId !== authz.user.id) {
      return NextResponse.json(
        { error: "This leave request belongs to another cadet" },
        { status: 403 }
      );
    }

    return NextResponse.json({ request: serializeLeave(request) });
  } catch (error) {
    return serviceErrorResponse(error, "The leave request could not be loaded");
  }
}
