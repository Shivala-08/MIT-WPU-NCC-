import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

import {
  USER_PASSWORD_OMIT,
  stripPassword,
  stripPasswordFromRecords,
} from "../src/lib/user-fields.mjs";
import { classifyDatabaseTarget } from "../src/lib/prisma-target.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const BASE_URL = process.env.NCC_TEST_BASE_URL ?? "http://localhost:3001";
const BCRYPT_PATTERN = /\$2[aby]\$\d\d\$/;

function readEnvFile(path) {
  const values = {};
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return values;
  }
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

function listSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function findUserQueryCallSites(source) {
  const sites = [];
  const pattern =
    /prisma\.user\.(findMany|findUnique|findFirst|findFirstOrThrow|findUniqueOrThrow|create|update)\s*\(/g;
  let match;
  while ((match = pattern.exec(source))) {
    let depth = 0;
    let index = pattern.lastIndex - 1;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    sites.push({
      method: match[1],
      args: source.slice(pattern.lastIndex, index),
    });
  }
  return sites;
}

test("the shared omit constant excludes the password field", () => {
  assert.deepEqual({ ...USER_PASSWORD_OMIT }, { password: true });
  assert.ok(!("password" in USER_PASSWORD_OMIT) || USER_PASSWORD_OMIT.password === true);
});

test("stripPassword removes only the password field", () => {
  const user = {
    id: "u1",
    name: "Cadet",
    email: "cadet@mitwpu.edu.in",
    password: "$2a$12$hash",
    role: "CADET",
  };
  const stripped = stripPassword(user);
  assert.ok(!("password" in stripped));
  assert.equal(stripped.id, "u1");
  assert.equal(stripped.email, "cadet@mitwpu.edu.in");
  assert.equal(stripped.role, "CADET");
  assert.equal(user.password, "$2a$12$hash", "the source object must not be mutated");
});

test("stripPasswordFromRecords handles lists and single records", () => {
  const records = [{ id: "a", password: "hash" }, { id: "b", password: "hash" }];
  const stripped = stripPasswordFromRecords(records);
  assert.equal(stripped.length, 2);
  for (const record of stripped) {
    assert.ok(!("password" in record));
  }
  assert.equal(stripPasswordFromRecords(null), null);
});

test("every User query in the application excludes or selects fields explicitly", () => {
  const appDir = join(REPO_ROOT, "src", "app");
  const offenders = [];

  for (const file of listSourceFiles(appDir)) {
    const source = readFileSync(file, "utf8");
    for (const site of findUserQueryCallSites(source)) {
      const hasOmit = /\bomit\s*:/.test(site.args);
      const hasSelect = /\bselect\s*:/.test(site.args);
      if (!hasOmit && !hasSelect) {
        offenders.push(`${relative(REPO_ROOT, file)} (prisma.user.${site.method})`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `User queries must use omit or select so the password column is never loaded: ${offenders.join(", ")}`
  );
});

async function loadIntegrationContext() {
  const env = { ...readEnvFile(join(REPO_ROOT, ".env")), ...readEnvFile(join(REPO_ROOT, ".env.local")) };
  const target = classifyDatabaseTarget(env.DATABASE_URL, { env });

  if (target.kind !== "local") {
    return { skip: "the configured DATABASE_URL is not a local development database" };
  }

  if (!env.NEXTAUTH_SECRET && !env.AUTH_SECRET) {
    return { skip: "no session secret is configured locally" };
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
  } catch {
    return { skip: `the development server is not reachable at ${BASE_URL}` };
  }
  if (!response.ok) {
    return { skip: `the development server at ${BASE_URL} did not answer` };
  }

  return { skip: null, env, target };
}

async function withAdminSession(run) {
  const context = await loadIntegrationContext();
  if (context.skip) {
    return { skip: context.skip };
  }

  const { PrismaClient } = await import("@prisma/client");
  const { encode } = await import("next-auth/jwt");

  const prisma = new PrismaClient({ datasources: { db: { url: context.env.DATABASE_URL } } });
  let admin;
  try {
    admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true, email: true, name: true },
    });
  } finally {
    await prisma.$disconnect();
  }

  if (!admin) {
    return { skip: "no admin account exists in the local development database" };
  }

  const secret = context.env.AUTH_SECRET ?? context.env.NEXTAUTH_SECRET;
  const token = await encode({
    token: {
      id: admin.id,
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      role: "ADMIN",
    },
    secret,
    salt: "authjs.session-token",
  });

  const cookie = `authjs.session-token=${token}`;
  const result = await run(cookie);
  return { skip: null, result };
}

async function withProbeCadet(run) {
  const context = await loadIntegrationContext();
  if (context.skip) {
    return { skip: context.skip };
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: context.env.DATABASE_URL } } });
  const probeEmail = `password-probe-${Date.now()}@mitwpu.edu.in`;

  try {
    await prisma.user.create({
      data: {
        name: "Password Exposure Probe",
        email: probeEmail,
        password: "$2a$12$probehashprobehashprobehashprobehashprobehashprobehas",
        role: "CADET",
      },
    });
  } catch (error) {
    await prisma.$disconnect();
    return { skip: `the probe account could not be created: ${String(error?.message).slice(0, 120)}` };
  }

  try {
    return { skip: null, result: await run(probeEmail) };
  } finally {
    await prisma.user.deleteMany({ where: { email: probeEmail } });
    await prisma.$disconnect();
  }
}

test("the admin cadets API never returns password hashes", async (t) => {
  const outcome = await withProbeCadet(async (probeEmail) => {
    const admin = await withAdminSession(async (cookie) => {
      const response = await fetch(`${BASE_URL}/api/admin/cadets`, {
        headers: { cookie },
      });
      const text = await response.text();
      return { status: response.status, text };
    });

    if (admin.skip) {
      return { skip: admin.skip };
    }

    return { status: admin.result.status, text: admin.result.text, probeEmail };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 200);
  assert.ok(
    !BCRYPT_PATTERN.test(outcome.result.text),
    "the cadets API must not contain bcrypt password hashes"
  );

  const payload = JSON.parse(outcome.result.text);
  const probe = payload.find((record) => record.email === outcome.result.probeEmail);
  assert.ok(probe, "the probe cadet must be present in the response so the assertion is meaningful");
  for (const record of payload) {
    assert.ok(!("password" in record), "each cadet record must not contain a password field");
  }
});

test("the admin attendance API never returns password hashes", async (t) => {
  const outcome = await withAdminSession(async (cookie) => {
    const response = await fetch(`${BASE_URL}/api/admin/attendance`, {
      headers: { cookie },
    });
    const text = await response.text();
    return { status: response.status, text };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 200);
  assert.ok(
    !BCRYPT_PATTERN.test(outcome.result.text),
    "the attendance API must not contain bcrypt password hashes"
  );
});

test("the admin page payload never contains password hashes", async (t) => {
  const outcome = await withProbeCadet(async (probeEmail) => {
    const admin = await withAdminSession(async (cookie) => {
      const response = await fetch(`${BASE_URL}/admin`, { headers: { cookie } });
      const text = await response.text();
      return { status: response.status, text };
    });

    if (admin.skip) {
      return { skip: admin.skip };
    }

    return { status: admin.result.status, text: admin.result.text, probeEmail };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 200);
  assert.ok(
    outcome.result.text.includes("Password Exposure Probe"),
    "the probe cadet must be serialised into the page so the assertion is meaningful"
  );
  assert.ok(
    !BCRYPT_PATTERN.test(outcome.result.text),
    "the serialised admin page must not contain bcrypt password hashes"
  );
  assert.ok(
    !/"password"\s*:\s*"\$\d?2[aby]\$/.test(outcome.result.text),
    "the serialised admin page must not contain a password field"
  );
});
