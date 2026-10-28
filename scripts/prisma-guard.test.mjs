import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyTarget,
  collectProductionRefs,
  evaluatePolicy,
  extractProjectRef,
  parseCommand,
  resolveTargetUrl,
  runGuard,
  PROD_ENV_FILE,
} from "./prisma-guard.mjs";

const PROD_REF = "abc123def456ghi789";
const PROD_PASSWORD = "prod-secret-value";

const prodUrl = `postgresql://postgres.${PROD_REF}:${PROD_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const devUrl = "postgresql://pallav@127.0.0.1:5432/ncc_dev?schema=public";

const knownRefs = new Set([PROD_REF]);

function capture() {
  const out = [];
  const err = [];
  return {
    out,
    err,
    log: (message) => out.push(String(message)),
    errorLog: (message) => err.push(String(message)),
    text: () => [...out, ...err].join("\n"),
  };
}

async function runWith(argv, { env = {}, cwd = process.cwd(), prodEnvFile = "/nonexistent" } = {}) {
  const logs = capture();
  let spawnCalled = false;
  const exitCode = await runGuard(argv, {
    env,
    cwd,
    prodEnvFile,
    log: logs.log,
    errorLog: logs.errorLog,
    spawnImpl: async () => {
      spawnCalled = true;
      return 0;
    },
  });
  return { exitCode, spawnCalled, logs };
}

test("1. allows the dedicated development database", async () => {
  for (const command of ["migrate dev", "migrate reset", "db push", "db seed", "migrate deploy"]) {
    const result = await runWith(command.split(" "), { env: { DATABASE_URL: devUrl } });
    assert.equal(result.exitCode, 0, `${command} should be allowed against the dev database`);
    assert.equal(result.spawnCalled, true, `${command} should reach the CLI`);
  }
});

test("2. blocks production for development/destructive commands", async () => {
  const blocked = ["migrate dev", "migrate reset", "db push", "db seed", "db execute", "studio"];
  for (const command of blocked) {
    const result = await runWith(command.split(" "), { env: { DATABASE_URL: prodUrl } });
    assert.equal(result.exitCode, 3, `${command} must be blocked against production`);
    assert.equal(result.spawnCalled, false, `${command} must not reach the CLI`);
  }

  const execResult = await runWith(["exec", "npx", "tsx", "prisma/seed.ts"], {
    env: { DATABASE_URL: prodUrl },
  });
  assert.equal(execResult.exitCode, 3, "exec mode must be blocked against production");
  assert.equal(execResult.spawnCalled, false);
});

test("3. requires explicit authorisation for production migrate deploy/resolve", async () => {
  for (const command of ["migrate deploy", "migrate resolve"]) {
    const blocked = await runWith(command.split(" "), { env: { DATABASE_URL: prodUrl } });
    assert.equal(blocked.exitCode, 3, `${command} must be blocked without authorisation`);
    assert.equal(blocked.spawnCalled, false);

    const authorised = await runWith(command.split(" "), {
      env: { DATABASE_URL: prodUrl, PRISMA_ALLOW_PRODUCTION: "1" },
    });
    assert.equal(authorised.exitCode, 0, `${command} must run when explicitly authorised`);
    assert.equal(authorised.spawnCalled, true);
  }
});

test("4. allows read-only production status and diff checks", async () => {
  for (const command of ["migrate status", "migrate diff"]) {
    const result = await runWith(command.split(" "), { env: { DATABASE_URL: prodUrl } });
    assert.equal(result.exitCode, 0, `${command} must be allowed against production`);
    assert.equal(result.spawnCalled, true);
  }
});

test("5. rejects missing or malformed database URLs", async () => {
  const missing = await runWith(["db push"], {
    env: {},
    cwd: "/nonexistent-working-directory",
    prodEnvFile: "/nonexistent",
  });
  assert.equal(missing.exitCode, 3, "missing DATABASE_URL must be blocked");
  assert.equal(missing.spawnCalled, false);

  for (const malformed of ["not-a-url", "http://example.com/db", "://bad", "postgresql://"]) {
    const result = await runWith(["db push"], {
      env: { DATABASE_URL: malformed },
      prodEnvFile: "/nonexistent",
    });
    assert.equal(result.exitCode, 3, `malformed URL "${malformed}" must be blocked`);
    assert.equal(result.spawnCalled, false);
  }

  const check = await runWith(["check"], {
    env: { DATABASE_URL: "not-a-url" },
    prodEnvFile: "/nonexistent",
  });
  assert.equal(check.exitCode, 3, "check mode must fail for a malformed URL");
});

test("6. identifies the production project across URL and hostname variations", () => {
  const variants = [
    `postgresql://postgres.${PROD_REF}:${PROD_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    `postgresql://postgres%2E${PROD_REF}:${PROD_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
    `postgres://postgres.${PROD_REF}:${PROD_PASSWORD}@pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${PROD_REF}:${PROD_PASSWORD}@AWS-0-AP-SOUTH-1.POOLER.SUPABASE.COM:5432/postgres`,
    `postgresql://postgres.${PROD_REF}:${PROD_PASSWORD}@db.${PROD_REF}.supabase.co:5432/postgres`,
    `postgresql://postgres%2E${PROD_REF}@db%2E${PROD_REF}.supabase.co:5432/postgres`,
    `postgresql://postgres.${PROD_REF.toUpperCase()}:${PROD_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  ];
  for (const url of variants) {
    const target = classifyTarget(url, knownRefs);
    assert.ok(
      target.kind === "production" || target.kind === "production-like",
      `variant ${url.replace(PROD_PASSWORD, "***")} must be treated as production, got ${target.kind}`
    );
    const policy = evaluatePolicy({
      commandKey: "db push",
      mode: "prisma",
      target,
      allowProduction: false,
    });
    assert.equal(policy.allowed, false, `variant ${url.replace(PROD_PASSWORD, "***")} must block db push`);
  }

  assert.equal(extractProjectRef(variants[1]), PROD_REF, "percent-encoded username must decode");
  assert.equal(extractProjectRef(variants[4]), PROD_REF, "direct db.<ref> host must yield the ref");

  const refsFromEnvFile = collectProductionRefs({
    env: {},
    prodEnvFile: "/nonexistent",
  });
  assert.equal(refsFromEnvFile.size, 0);
});

test("7. never prints credentials or complete connection strings", async () => {
  const result = await runWith(["migrate status"], { env: { DATABASE_URL: prodUrl } });
  const printed = result.logs.text();
  assert.ok(!printed.includes(PROD_PASSWORD), "the password must never be printed");
  assert.ok(!printed.includes(prodUrl), "the full connection string must never be printed");
  assert.ok(!printed.includes("postgres." + PROD_REF), "the full project reference must not be printed");
  assert.ok(printed.includes("…"), "the project reference should be masked");
});

test("8. parses real Prisma CLI argument shapes", () => {
  assert.deepEqual(parseCommand(["migrate", "dev", "--name", "add_x"]), {
    mode: "prisma",
    commandKey: "migrate dev",
    args: ["migrate", "dev", "--name", "add_x"],
  });
  assert.equal(parseCommand(["db", "push", "--accept-data-loss"]).commandKey, "db push");
  assert.equal(parseCommand(["db", "seed"]).commandKey, "db seed");
  assert.equal(parseCommand(["migrate", "resolve", "--applied", "20261026000000_x"]).commandKey, "migrate resolve");
  assert.equal(parseCommand(["migrate", "reset", "--force"]).commandKey, "migrate reset");
  assert.equal(parseCommand(["db", "execute", "--file", "x.sql"]).commandKey, "db execute");
  assert.equal(parseCommand(["studio"]).commandKey, "studio");
  assert.equal(parseCommand(["exec", "npx", "tsx", "prisma/seed.ts"]).mode, "exec");
  assert.equal(parseCommand([]).mode, "check");
  assert.equal(parseCommand(["check"]).mode, "check");
});

test("9. npm scripts cannot bypass the guard", () => {
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
  const scripts = pkg.scripts ?? {};
  const guarded = Object.entries(scripts).filter(([name]) => name.startsWith("db:"));

  assert.ok(guarded.length >= 7, "expected the db:* script surface to be present");
  for (const [name, command] of guarded) {
    assert.ok(
      command.includes("scripts/prisma-guard.mjs"),
      `npm script "${name}" must route through the guard, got: ${command}`
    );
  }

  const destructive = /\bprisma\s+(migrate\s+(dev|reset)|db\s+(push|seed|execute))\b/;
  for (const [name, command] of Object.entries(scripts)) {
    assert.ok(
      !destructive.test(command),
      `npm script "${name}" invokes a destructive Prisma command directly: ${command}`
    );
  }
});

test("resolves the target URL from the environment before the .env fallback", () => {
  const fromEnv = resolveTargetUrl({
    env: { DATABASE_URL: prodUrl },
    cwd: resolve(process.cwd(), "does-not-exist"),
  });
  assert.equal(fromEnv, prodUrl);
});

test("classifies local hosts as development and unknown remotes as production-like", () => {
  assert.equal(classifyTarget(devUrl, knownRefs).kind, "development");
  assert.equal(classifyTarget("postgresql://pallav@localhost:5432/ncc_dev", knownRefs).kind, "development");
  assert.equal(classifyTarget("postgresql://pallav@[::1]:5432/ncc_dev", knownRefs).kind, "development");
  assert.equal(classifyTarget("postgresql://u:p@db.example.com:5432/app", knownRefs).kind, "production-like");
  assert.equal(classifyTarget("", knownRefs).kind, "invalid");
});

test("detects the configured production project when one is available", () => {
  const refs = collectProductionRefs({ env: process.env, prodEnvFile: PROD_ENV_FILE });
  if (refs.size === 0) return; // no production credentials configured on this machine
  for (const ref of refs) {
    const target = classifyTarget(
      `postgresql://postgres.${ref}:${PROD_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
      refs
    );
    assert.equal(target.kind, "production", "the configured production project must classify as production");
    assert.ok(!target.label.includes(ref), "the project reference must be masked in labels");
  }
});
