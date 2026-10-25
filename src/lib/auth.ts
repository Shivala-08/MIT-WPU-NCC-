import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export type Role = "ADMIN" | "OFFICER" | "CADET";

// Google OAuth sign-in function for client use
export async function signInWithGoogle() {
  const { supabase } = await import("@/lib/supabase");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth/callback`,
    },
  });
  if (error) throw error;
  return data;
}

// Helper to check if user's email is from the allowed college domain
export async function isApprovedEmail(email: string): Promise<boolean> {
  if (!email) return false;
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || "mitwpu.edu.in";
  return email.toLowerCase().endsWith(`@${allowedDomain}`);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Check if user's email is from the allowed college domain
      if (user.email) {
        const isApproved = await isApprovedEmail(user.email);
        if (!isApproved) {
          // Block sign-in for non-college emails
          return "/pending";
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.role && token.id) {
        (session.user as { role: Role }).role = token.role as Role;
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60,
  },
  pages: {
    signIn: "/login",
    signOut: "/login",
  },
  // Disable CSRF check for signout to allow proper session clearing
  trustHost: true,
});