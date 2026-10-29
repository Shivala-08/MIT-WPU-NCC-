import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";
import { isRole, type Role } from "@/lib/roles";
import {
  parseAllowedEmailDomains,
} from "@/lib/eligibility.mjs";
import { resolveGoogleAccount } from "@/lib/account-service.mjs";

export const allowedEmailDomains = parseAllowedEmailDomains(
  process.env.ALLOWED_EMAIL_DOMAIN
);

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

      const emailVerified = (profile as { email_verified?: boolean } | undefined)
        ?.email_verified;

      const result = await resolveGoogleAccount(prisma, {
        provider: account.provider,
        email: user.email,
        emailVerified,
        name: user.name,
        image: user.image,
        allowedEmailDomains,
      });

      if (!result.ok) {
        console.warn(`Google sign-in refused (${result.reason}).`);
        return false;
      }

      const dbUser = result.user;

      (user as { id: string }).id = dbUser.id;
      (user as { role: Role }).role = dbUser.role as Role;
      (user as { approvalStatus: string }).approvalStatus =
        dbUser.approvalStatus;

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role?: Role }).role;
        token.approvalStatus = (user as { approvalStatus?: string })
          .approvalStatus;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? token.sub ?? "";
        if (isRole(token.role)) {
          session.user.role = token.role;
        }
        if (token.approvalStatus) {
          session.user.approvalStatus = token.approvalStatus;
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
