"use client";

import { createServerClient } from "@supabase/ssr";
import { type ReactNode } from "react";

// Create a Supabase client instance for server components and API routes
// The client is created once and reused; Supabase handles session cookies per-request
export const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  {} as any
);

// Type for the session user
export type User = {
  id: string;
  email: string | null | undefined;
  role: "ADMIN" | "OFFICER" | "CADET";
};

// Export types for session user role
export type Role = "ADMIN" | "OFFICER" | "CADET";

// Helper to get the current user from the session
export async function getUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  if (!data.user) return null;

  // Determine role from user metadata or default to CADET
  const { data: profile } = await supabase
    .from("User")
    .select("role")
    .eq("id", data.user!.id)
    .single();

  return {
    id: data.user!.id,
    email: data.user!.email,
    role: profile?.role as User["role"] || "CADET",
  };
}

// Helper to sign in with Google OAuth
export async function signInWithGoogle() {
  // Use the signInWithGoogle function from auth.ts instead for OAuth
  const { signInWithGoogle } = await import("@/lib/auth");
  return signInWithGoogle();
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