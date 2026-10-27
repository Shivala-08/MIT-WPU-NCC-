import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Role } from "@/lib/roles";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  image: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;

  if (!id) {
    return null;
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, image: true },
    });

    if (!dbUser) {
      return null;
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      image: dbUser.image,
    };
  } catch (error) {
    console.error("Session user lookup failed:", error);
    return null;
  }
}

export type AuthorizeResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

export async function authorize(
  allowedRoles: Role[]
): Promise<AuthorizeResult> {
  const user = await getSessionUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}
