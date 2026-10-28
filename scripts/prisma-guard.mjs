#!/usr/bin/env node
/**
 * Prisma preflight guard.
 *
 * Fail-closed wrapper around the Prisma CLI:
 *   - development/destructive commands may only run against a local development database;
 *   - production-scoped migration commands require an explicit opt-in;
 *   - read-only commands are always allowed;
 *   - a missing or malformed connection string blocks everything.
 *
 * The guard never prints credentials or complete connection strings.
 *
 * Usage:
 *   node scripts/prisma-guard.mjs check
 *   node scripts/prisma-guard.mjs <prisma-args...>
 *   node scripts/prisma-guard.mjs exec <command> [args...]
 *
 * Environment:
 *   DATABASE_URL                  target connection (falls back to ./.env)
 *   PRISMA_ALLOW_PRODUCTION=1     authorises production-scoped commands
 *   PRISMA_PRODUCTION_PROJECT_REF comma-separated refs treated as production
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROD_ENV_FILE = join(homedir(), ".ncc-prod.env");

const DEVELOPMENT_ONLY_COMMANDS = new Set([
  "migrate dev",
  "migrate reset",
  "db push",
  "db seed",
  "db execute",
  "studio",
]);

const PRODUCTION_WRITE_COMMANDS = new Set(["migrate deploy", "migrate resolve"]);

const READ_ONLY_COMMANDS = new Set([
  "migrate status",
  "migrate diff",
  "generate",
  "validate",
  "version",
  "format",
  "debug",
]);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function parseEnvFile(content) {
  const values = {};
  for (const line of String(content ?? "").split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

export function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return parseEnvFile(readFileSync(path, "utf8"));
}

export function resolveTargetUrl({ env = {}, cwd = process.cwd() } = {}) {
  if (env.DATABASE_URL && env.DATABASE_URL.trim()) return env.DATABASE_URL.trim();
  return readEnvFile(resolve(cwd, ".env")).DATABASE_URL?.trim() ?? "";
}

export function collectProductionRefs({ env = {}, prodEnvFile = PROD_ENV_FILE } = {}) {
  const refs = new Set();
  const add = (value) => {
    const cleaned = String(value ?? "").trim().toLowerCase();
    if (cleaned) refs.add(cleaned);
  };
  if (env.PRISMA_PRODUCTION_PROJECT_REF) {
    for (const ref of env.PRISMA_PRODUCTION_PROJECT_REF.split(",").map((r) => r.trim())) add(ref);
  }
  for (const value of Object.values(readEnvFile(prodEnvFile))) {
    const decoded = decodeURIComponent(String(value));
    const match = decoded.match(/postgres\.([a-z0-9]{8,})/i);
    if (match) add(match[1]);
  }
  return refs;
}

export function maskRef(ref) {
  if (!ref) return "";
  if (ref.length < 9) return `${ref.slice(0, 2)}…`;
  return `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

export function isSupabaseHost(host) {
  return /\.(supabase\.(com|co)|supabase\.in)$/.test(host);
}

export function extractProjectRef(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const username = decodeURIComponent(parsed.username ?? "");
  const userMatch = username.match(/^postgres\.([a-z0-9]{8,})$/i);
  if (userMatch) return userMatch[1].toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const hostMatch = host.match(/^db\.([a-z0-9]{8,})\.supabase\.co$/);
  if (hostMatch) return hostMatch[1].toLowerCase();
  return null;
}

export function classifyTarget(url, knownRefs = new Set()) {
  if (!url) {
    return { kind: "invalid", reason: "missing", label: "no DATABASE_URL resolved" };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "invalid", reason: "malformed", label: "DATABASE_URL is not a parsable URL" };
  }
  const protocol = parsed.protocol.replace(":", "").toLowerCase();
  if (protocol !== "postgres" && protocol !== "postgresql") {
    return {
      kind: "invalid",
      reason: "unsupported-protocol",
      label: `DATABASE_URL uses unsupported protocol "${protocol}"`,
    };
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const database = parsed.pathname.replace(/^\//, "") || "(default)";
  const ref = extractProjectRef(url);
  const isLocal = LOCAL_HOSTS.has(host) || /^127\./.test(host) || host.endsWith(".localhost");
  if (isLocal) {
    return {
      kind: "development",
      ref,
      label: `local PostgreSQL at ${host}:${parsed.port || "5432"}/${database}`,
    };
  }
  if (ref && knownRefs.has(ref)) {
    return {
      kind: "production",
      ref,
      label: `production database (project ref ${maskRef(ref)})`,
    };
  }
  if (isSupabaseHost(host)) {
    return {
      kind: "production-like",
      ref,
      label: `Supabase project database (project ref ${maskRef(ref ?? "unknown")}) — treated as production`,
    };
  }
  return {
    kind: "production-like",
    ref,
    label: `remote database host ${host}/${database} — treated as production`,
  };
}

export function parseCommand(argv) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.length === 0 || args[0] === "check") {
    return { mode: "check", commandKey: "check", args: [] };
  }
  if (args[0] === "exec") {
    const rest = args.slice(1);
    return { mode: "exec", commandKey: `exec ${rest[0] ?? ""}`.trim(), args: rest };
  }
  const head = args[0];
  const key = head === "db" || head === "migrate" ? `${head} ${args[1] ?? ""}`.trim() : head;
  return { mode: "prisma", commandKey: key, args };
}

export function evaluatePolicy({ commandKey, mode, target, allowProduction = false }) {
  const messages = [];
  const developmentTarget = target.kind === "development";

  if (target.kind === "invalid") {
    messages.push(
      `[prisma-guard] BLOCKED: the target connection is ${target.reason}; refusing to run any Prisma command.`
    );
    return { allowed: false, exitCode: 3, messages, effect: "invalid" };
  }

  const isDevelopmentCommand = mode === "exec" || DEVELOPMENT_ONLY_COMMANDS.has(commandKey);
  const isProductionWrite = PRODUCTION_WRITE_COMMANDS.has(commandKey);
  const isReadOnly = READ_ONLY_COMMANDS.has(commandKey);

  if (developmentTarget) {
    messages.push(`[prisma-guard] allowed: "${commandKey}" against the development database.`);
    return { allowed: true, exitCode: 0, messages, effect: "development" };
  }

  if (isReadOnly) {
    messages.push(`[prisma-guard] allowed: "${commandKey}" is read-only (target: ${target.kind}).`);
    return { allowed: true, exitCode: 0, messages, effect: "read-only" };
  }

  if (isDevelopmentCommand) {
    messages.push(
      `[prisma-guard] BLOCKED: "${commandKey}" changes database state and the target is ${target.kind}.`
    );
    messages.push(
      "[prisma-guard] Point DATABASE_URL at a development database, or set PRISMA_ALLOW_PRODUCTION=1 for an intentional, authorised operation."
    );
    return { allowed: false, exitCode: 3, messages, effect: "development-only" };
  }

  if (isProductionWrite || !isReadOnly) {
    if (!allowProduction) {
      messages.push(
        `[prisma-guard] BLOCKED: "${commandKey}" targets ${target.kind}. Re-run with PRISMA_ALLOW_PRODUCTION=1 to authorise it explicitly.`
      );
      return { allowed: false, exitCode: 3, messages, effect: "production-write" };
    }
    messages.push(
      `[prisma-guard] WARNING: running "${commandKey}" against ${target.kind} (explicitly authorised).`
    );
    return { allowed: true, exitCode: 0, messages, effect: "production-write" };
  }

  messages.push(`[prisma-guard] allowed: "${commandKey}" (target: ${target.kind}).`);
  return { allowed: true, exitCode: 0, messages, effect: "other" };
}

function spawnPrisma(args, env, cwd) {
  return new Promise((resolvePromise) => {
    const bin = resolve(cwd, "node_modules", ".bin", "prisma");
    const child = spawn(bin, args, { stdio: "inherit", env });
    child.on("error", (error) => {
      console.error(`[prisma-guard] failed to start the Prisma CLI: ${error.message}`);
      resolvePromise(1);
    });
    child.on("exit", (code, signal) => resolvePromise(code ?? (signal ? 1 : 0)));
  });
}

export async function runGuard(argv, options = {}) {
  const {
    env = process.env,
    cwd = process.cwd(),
    prodEnvFile = PROD_ENV_FILE,
    log = console.log,
    errorLog = console.error,
    spawnImpl = spawnPrisma,
  } = options;

  const url = resolveTargetUrl({ env, cwd });
  const knownRefs = collectProductionRefs({ env, prodEnvFile });
  const target = classifyTarget(url, knownRefs);
  const { mode, commandKey, args } = parseCommand(argv);

  if (mode === "check") {
    if (target.kind === "invalid") {
      errorLog(`[prisma-guard] target: invalid — ${target.label}`);
      return 3;
    }
    log(`[prisma-guard] target: ${target.kind} — ${target.label}`);
    log(`[prisma-guard] production project refs known: ${knownRefs.size}`);
    return 0;
  }

  const policy = evaluatePolicy({
    commandKey,
    mode,
    target,
    allowProduction: env.PRISMA_ALLOW_PRODUCTION === "1",
  });

  log(`[prisma-guard] command: ${commandKey}`);
  log(`[prisma-guard] target:  ${target.kind} — ${target.label}`);
  for (const message of policy.messages) {
    if (message.includes("BLOCKED")) errorLog(message);
    else log(message);
  }

  if (!policy.allowed) return policy.exitCode;

  const childEnv = { ...readEnvFile(resolve(cwd, ".env")), ...env, DATABASE_URL: url };
  if (mode === "exec") {
    const [command, ...rest] = args;
    if (!command) {
      errorLog("[prisma-guard] exec mode requires a command to run.");
      return 2;
    }
    return new Promise((resolvePromise) => {
      const child = spawn(command, rest, { stdio: "inherit", env: childEnv, cwd });
      child.on("error", (error) => {
        errorLog(`[prisma-guard] failed to start "${command}": ${error.message}`);
        resolvePromise(1);
      });
      child.on("exit", (code, signal) => resolvePromise(code ?? (signal ? 1 : 0)));
    });
  }

  return spawnImpl(args, childEnv, cwd);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await runGuard(process.argv.slice(2));
}
