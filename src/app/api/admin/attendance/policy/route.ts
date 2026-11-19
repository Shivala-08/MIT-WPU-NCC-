import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { readPolicy, updatePolicy } from "@/lib/attendance-policy.mjs";
import { canAdministerSessions } from "@/lib/attendance-permissions.mjs";
import { readJsonBody, serviceErrorResponse } from "@/lib/http";

export async function GET() {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const policy = await readPolicy(prisma);

    return NextResponse.json({ policy });
  } catch (error) {
    return serviceErrorResponse(error, "The policy could not be loaded");
  }
}

export async function PATCH(req: Request) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canAdministerSessions(authz.user.role)) {
    return NextResponse.json(
      { error: "Only an administrator can change the attendance policy" },
      { status: 403 }
    );
  }

  try {
    const body = await readJsonBody(req);
    const policy = await updatePolicy(prisma, {
      actor: authz.user,
      values: body ?? {},
    });

    return NextResponse.json({ policy });
  } catch (error) {
    return serviceErrorResponse(error, "The policy could not be saved");
  }
}
