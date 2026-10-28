import { PrismaClient } from "@prisma/client";
import { assertSafeDatabaseTarget } from "./prisma-target.mjs";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function currentMode(): "development" | "production" {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

function createPrismaClient(): PrismaClient {
  assertSafeDatabaseTarget({
    url: process.env.DATABASE_URL,
    mode: currentMode(),
    env: process.env,
  });

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
