/**
 * The shared setup of the suites that need a real database.
 *
 * A suite that runs against the local development database must never hide a
 * broken environment behind a skip. The rule of this helper is:
 *
 *   * the configured database is not a local development database -> the
 *     suite skips, because there is nothing to test against;
 *   * the configured database is the local development database and
 *     something is missing (the session secret, the development server, the
 *     database itself, a column of a migration) -> the suite fails.
 *
 * The second rule is the important one. A suite that skips when the server is
 * down reports a green result while it proved nothing. The report of the
 * suite has to say that the integration was not verified.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { classifyDatabaseTarget } from "../../src/lib/prisma-target.mjs";

export const REPO_ROOT = resolve(import.meta.dirname, "..", "..");

export const BASE_URL =
  process.env.NCC_TEST_BASE_URL ?? "http://localhost:3001";

/**
 * Reads a `.env` style file.
 *
 * @param {string} path
 * @returns {Record<string, string>}
 */
export function readEnvFile(path) {
  const values = {};

  if (!existsSync(path)) {
    return values;
  }

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);

    if (!match) continue;

    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }

  return values;
}

/**
 * Loads the environment of the repository.
 *
 * @returns {Record<string, string>}
 */
export function loadEnv() {
  return {
    ...readEnvFile(join(REPO_ROOT, ".env")),
    ...readEnvFile(join(REPO_ROOT, ".env.local")),
  };
}

/**
 * The context of a suite that needs the local development database.
 *
 * @param {{ requireSecret?: boolean }} [options]
 * @returns {{
 *   skip: string | null,
 *   env: Record<string, string>,
 *   secret: string | null,
 *   target: { kind: string },
 * }}
 */
export function loadSuiteContext({ requireSecret = true } = {}) {
  const env = loadEnv();
  const target = classifyDatabaseTarget(env.DATABASE_URL, { env });

  if (target.kind !== "local") {
    return {
      skip: "the configured DATABASE_URL is not a local development database",
      env,
      secret: null,
      target,
    };
  }

  const secret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET ?? null;

  if (requireSecret && !secret) {
    return {
      skip: null,
      env,
      secret: null,
      target,
    };
  }

  return { skip: null, env, secret, target };
}

/**
 * Fails when the session secret of the local environment is missing.
 *
 * @param {string | null} secret
 * @returns {void}
 */
export function requireSecret(secret) {
  if (!secret) {
    throw new Error(
      "The local environment has no session secret. The suite needs it, so it fails instead of skipping."
    );
  }
}

/**
 * Fails when the development server does not answer.
 *
 * @param {string} [baseUrl]
 * @returns {Promise<void>}
 */
export async function requireServer(baseUrl = BASE_URL) {
  let reachable = false;

  try {
    const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
    reachable = response.ok || response.status === 307;
  } catch {
    reachable = false;
  }

  if (!reachable) {
    throw new Error(
      `The development server at ${baseUrl} did not answer. The suite needs the server, so it fails instead of skipping.`
    );
  }
}

/**
 * Fails when the database does not answer.
 *
 * @param {any} prisma
 * @returns {Promise<void>}
 */
export async function requireDatabase(prisma) {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `The local development database did not answer: ${String(
        error?.message ?? error
      )}`
    );
  }
}

/**
 * Fails when a column of a migration is missing.
 *
 * The column is the proof that the migration was applied. A suite that skips
 * when the column is missing hides an unapplied migration behind a green
 * result.
 *
 * @param {any} prisma
 * @param {string} table
 * @param {string} column
 * @param {string} migration
 * @returns {Promise<void>}
 */
export async function requireColumn(prisma, table, column, migration) {
  const rows = await prisma.$queryRaw`
    SELECT 1 AS present
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = ${table}
      AND column_name = ${column}
    LIMIT 1
  `;

  if (!rows || rows.length === 0) {
    throw new Error(
      `The column "${table}"."${column}" is missing. The migration ${migration} is not applied to the local database, so the suite fails instead of skipping.`
    );
  }
}

/**
 * Opens the Prisma client of the local environment.
 *
 * @param {Record<string, string>} env
 * @returns {Promise<any>}
 */
export async function createPrismaClient(env) {
  const { PrismaClient } = await import("@prisma/client");

  return new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });
}

/**
 * Builds a session cookie for an account of the local database.
 *
 * @param {string} secret
 * @param {{ id: string, email: string, name?: string, role?: string }} user
 * @param {string} [roleOverride]
 * @returns {Promise<string>}
 */
export async function sessionCookie(secret, user, roleOverride) {
  const { encode } = await import("next-auth/jwt");

  const token = await encode({
    token: {
      id: user.id,
      sub: user.id,
      email: user.email,
      name: user.name ?? `Fixture ${user.email}`,
      role: roleOverride ?? user.role ?? "CADET",
    },
    secret,
    salt: "authjs.session-token",
  });

  return `authjs.session-token=${token}`;
}
