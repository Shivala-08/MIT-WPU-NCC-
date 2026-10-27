"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type ReactNode } from "react";

// Create a Supabase client instance for server components and API routes
// The client is created once and reused; Supabase handles session cookies per-request
// We provide cookie methods to satisfy the SDK's runtime checks
// Using as any to satisfy TypeScript since the SDK expects specific cookie method signatures
const cookieOptions: any = {
  cookies: {
    getAll: () => [],
    setAll: () => [],
    get: () => null,
    set: () => {},
    remove: () => {},
  },
};

export const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  cookieOptions
);

// Export type for session user role
export type Role = "ADMIN" | "OFFICER" | "CADET";

// Export type for session user
export type User = {
  id: string;
  email: string | null | undefined;
  role: Role;
};

// Helper to get the current user from the session
export async function getUser(): Promise<{ id: string; email: string | null; role: Role } | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  if (!data.user) return null;

  return {
    id: data.user!.id,
    email: data.user!.email ?? null,
    role: "CADET"
  };
}

// Helper to sign out
export async function signOut() {
  await supabase.auth.signOut();
}

// Helper to check if user's email is from the allowed college domain
export async function isApprovedEmail(email: string): Promise<boolean> {
  if (!email) return false;
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || "mitwpu.edu.in";
  return email.toLowerCase().endsWith(`@${allowedDomain}`);
}