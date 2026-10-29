import type { DefaultSession } from "next-auth";

export const ROLES = ["ADMIN", "OFFICER", "CADET"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: Role;
      approvalStatus?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    approvalStatus?: string;
  }
}
