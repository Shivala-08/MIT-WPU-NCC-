import { supabase } from "@/lib/supabase";

export type Role = "ADMIN" | "OFFICER" | "CADET";

export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function requireRole(allowed: Role[]) {
  const user = await getUser();
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  const role = user.role as Role | undefined;
  if (!role || !allowed.includes(role)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
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
