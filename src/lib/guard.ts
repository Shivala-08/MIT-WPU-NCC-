import { auth } from "@/lib/auth";

export type Role = "ADMIN" | "OFFICER" | "CADET";

export async function requireRole(allowed: Role[]) {
  const session = await auth();
  if (!session?.user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  const role = session.user.role as Role | undefined;
  if (!role || !allowed.includes(role)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return session.user;
}

export async function requireAdmin() {
  return requireRole(["ADMIN"]);
}

export async function requireOfficerOrAdmin() {
  return requireRole(["ADMIN", "OFFICER"]);
}

export async function requireCadetOrAbove() {
  return requireRole(["ADMIN", "OFFICER", "CADET"]);
}
