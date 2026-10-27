import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";
import { isRole, type Role } from "@/lib/roles";

const allowedEmailDomain = (
  process.env.ALLOWED_EMAIL_DOMAIN ?? "mitwpu.edu.in"
).toLowerCase();

export function isAllowedCollegeEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${allowedEmailDomain}`);
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
      if (account?.provider !== "google") {
        return false;
      }

      const email = user.email?.trim().toLowerCase();
      if (!email) {
        return false;
      }

      if (!isAllowedCollegeEmail(email)) {
        return false;
      }

      const emailVerified = (profile as { email_verified?: boolean } | undefined)
        ?.email_verified;
      if (emailVerified === false) {
        return false;
      }

      try {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true },
        });

        if (!dbUser) {
          return false;
        }

        (user as { id: string }).id = dbUser.id;
        (user as { role: Role }).role = dbUser.role;

        return true;
      } catch (error) {
        console.error("Sign-in identity lookup failed:", error);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role?: Role }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? token.sub ?? "";
        if (isRole(token.role)) {
          session.user.role = token.role;
        }
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
    error: "/login",
  },
  trustHost: true,
});
