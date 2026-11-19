import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

import {
  USER_OMIT,
  stripPassword,
  stripPasswordFromRecords,
} from "../src/lib/user-fields.mjs";
import {
  BASE_URL,
  createPrismaClient,
  loadSuiteContext,
  requireDatabase,
  requireSecret,
  requireServer,
  sessionCookie,
} from "./helpers/db-suite.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const BCRYPT_PATTERN = /\$2[aby]\$\d\d\$/;

function listSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx|mjs)$/.test(entry) && !entry.endsWith(".d.mts")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * The methods of the `User` model that read or write a row.
 *
 * Every one of them has to name the fields it wants. A method that loads the
 * whole record asks the database for every column, including the column of
 * the origin of the approval decision. That column is added by the migration
 * `20261105000000_approval_decision_source`, and the application has to run
 * before and after that migration is applied.
 */
const USER_ROW_METHODS = [
  "findMany",
  "findUnique",
  "findFirst",
  "findFirstOrThrow",
  "findUniqueOrThrow",
  "create",
  "update",
  "delete",
  "upsert",
].join("|");

function findUserQueryCallSites(source) {
  const sites = [];
  // The receiver is the client itself or a transaction. The transaction
  // client is written as `tx.user` or `db.user`.
  const pattern = new RegExp(
    `\\b(?:prisma|tx|db|client)\\.user\\.(${USER_ROW_METHODS})\\s*\\(`,
    "g"
  );
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

test("the shared omit constant excludes the password field and the decision source", () => {
  assert.deepEqual(
    { ...USER_OMIT },
    { password: true, approvalDecisionSource: true }
  );
  assert.ok(!("password" in USER_OMIT) || USER_OMIT.password === true);
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
  const roots = [join(REPO_ROOT, "src", "app"), join(REPO_ROOT, "src", "lib")];
  const offenders = [];

  for (const root of roots) {
    for (const file of listSourceFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const site of findUserQueryCallSites(source)) {
        // The shorthand form (`select,`) counts as well as the full form.
        const namesFields = /\b(?:select|omit)\b/.test(site.args);
        if (!namesFields) {
          offenders.push(
            `${relative(REPO_ROOT, file)} (user.${site.method})`
          );
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Every User query must use omit or select: the password hash is never loaded and the column of the approval decision is only asked for when the database has it: ${offenders.join(", ")}`
  );
});

async function loadIntegrationContext() {
  const context = loadSuiteContext();

  if (context.skip) {
    return context;
  }

  // The server and the database are prerequisites of the suite. When they
  // do not answer the suite fails, because a skipped suite would report a
  // green result while it proved nothing.
  requireSecret(context.secret);
  await requireServer(BASE_URL);

  return context;
}

async function withAdminSession(run) {
  const context = await loadIntegrationContext();
  if (context.skip) {
    return { skip: context.skip };
  }

  const prisma = await createPrismaClient(context.env);

  let admin;
  try {
    await requireDatabase(prisma);
    admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true },
    });
  } finally {
    await prisma.$disconnect();
  }

  if (!admin) {
    throw new Error(
      "The local development database has no admin account. The suite needs one, so it fails instead of skipping."
    );
  }

  const cookie = await sessionCookie(context.secret, admin, "ADMIN");
  const result = await run(cookie);
  return { skip: null, result };
}

async function withProbeCadet(run) {
  const context = await loadIntegrationContext();
  if (context.skip) {
    return { skip: context.skip };
  }

  const prisma = await createPrismaClient(context.env);
  const probeEmail = `password-probe-${Date.now()}@mitwpu.edu.in`;

  try {
    await requireDatabase(prisma);
    await prisma.user.create({
      data: {
        name: "Password Exposure Probe",
        email: probeEmail,
        password: "$2a$12$probehashprobehashprobehashprobehashprobehashprobehas",
        role: "CADET",
      },
      // The fields of the record are named. The probe account is written
      // against a database that does not have the column of the approval
      // decision yet.
      omit: USER_OMIT,
    });
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    throw new Error(
      `The probe account could not be created: ${String(error?.message).slice(0, 160)}`
    );
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
