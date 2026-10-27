"use client";

import { supabase } from "./supabase-server";
import { type ReactNode } from "react";

// Re-export the supabase client instance
export { supabase };

// Re-export types
export type { Role, User } from "./supabase-server";

// Re-export helper functions
export { getUser, signOut, isApprovedEmail } from "./supabase-server";

// Google OAuth sign-in function for client use
// Triggers NextAuth OAuth flow with Google provider
// Returns true if sign-in initiation was successful
export async function signInWithGoogle(): Promise<boolean> {
  try {
    const { signIn } = await import("next-auth/react");
    await signIn("google", {
      callbackUrl: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth/callback`,
    });
    return true;
  } catch (error) {
    console.error("signInWithGoogle error:", error);
    return false;
  }
}