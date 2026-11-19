/**
 * The key of the email references of the audit trail.
 *
 * The suite proves the policy of the key without a database:
 *
 *   * production needs a dedicated `AUDIT_HASH_KEY`;
 *   * a missing key, a key that is too short and a key that repeats another
 *     secret of the deployment are refused;
 *   * the secret of the authentication and the secret of the check-in code are
 *     never used as the key of the trail in production;
 *   * the audit write is refused before the event reaches the table;
 *   * development keeps the fallback and writes a warning;
 *   * the reference of an address is the same in two separate processes when a
 *     key is configured, and it is different when the development fallback is
 *     used.
 *
 * The suite does not open a database. The rollback of the business
 * transaction is proved by `scripts/audit-rollback-integration.test.mjs`.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { writeAuditEvent } from "../src/lib/audit-writer.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

const MODULE_URL = pathToFileURL(
  join(REPO_ROOT, "src/lib/audit-redaction.mjs")
).href;

const DEDICATED_KEY = "audit-hash-key-0123456789abcdef";

const SECRET_NAMES = [
  "AUDIT_HASH_KEY",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "ATTENDANCE_CODE_SECRET",
  "VERCEL_ENV",
];

/**
 * Runs the body with a controlled environment and restores it afterwards.
 *
 * The mode of the key is decided by the environment of the process, so the
 * process itself has to be switched into the production mode.
 *
 * @param {Record<string, string | undefined>} env
 * @param {() => any} run
 * @returns {any}
 */
function withEnvironment(env, run) {
  const saved = new Map();

  for (const name of SECRET_NAMES) {
    saved.set(name, process.env[name]);
  }

  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

/**
 * A database double that records the writes of the audit trail.
 *
 * @returns {{ calls: any[], auditLog: { create: (args: any) => Promise<any> } }}
 */
function fakeAuditDb() {
  const calls = [];

  return {
    calls,
    auditLog: {
      async create(args) {
        calls.push(args);
        return { id: "audit-event-1", ...args.data };
      },
    },
  };
}

/**
 * A module instance of its own, so the fallback key of the process is fresh.
 *
 * @returns {Promise<any>}
 */
async function freshRedactionModule() {
  return import(`../src/lib/audit-redaction.mjs?fresh=${Date.now()}`);
}

/**
 * Computes the reference of an address in a separate process.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
function referenceInSeparateProcess(env) {
  const childEnv = { ...process.env };

  for (const name of SECRET_NAMES) {
    delete childEnv[name];
  }

  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined) {
      childEnv[name] = value;
    }
  }

  const script = `
import { emailReference } from ${JSON.stringify(MODULE_URL)};
process.stdout.write(emailReference("cadet@mitwpu.edu.in"));
`;

  return execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: childEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

test("production refuses the audit write when AUDIT_HASH_KEY is missing", async () => {
  const { emailReference } = await import("../src/lib/audit-redaction.mjs");

  await withEnvironment(
    {
      NODE_ENV: "production",
      VERCEL_ENV: undefined,
      AUDIT_HASH_KEY: undefined,
      AUTH_SECRET: undefined,
      NEXTAUTH_SECRET: undefined,
      ATTENDANCE_CODE_SECRET: undefined,
    },
    async () => {
      const db = fakeAuditDb();

      await assert.rejects(
        () =>
          writeAuditEvent(db, {
            actorId: null,
            action: "ACCOUNT_PENDING",
            entity: "User",
            entityId: "user-1",
            newData: { email: "cadet@mitwpu.edu.in" },
          }),
        (error) => {
          assert.equal(error.statusCode, 500);
          assert.match(error.message, /AUDIT_HASH_KEY is not configured/);
          return true;
        }
      );

      assert.equal(db.calls.length, 0, "the event was not written");

      // The reference itself is refused as well, so the rule cannot be
      // bypassed by calling the redaction directly.
      assert.throws(
        () => emailReference("cadet@mitwpu.edu.in"),
        /AUDIT_HASH_KEY is not configured/
      );
    }
  );
});

test("production refuses a key that is too short", async () => {
  await withEnvironment(
    {
      NODE_ENV: "production",
      VERCEL_ENV: undefined,
      AUDIT_HASH_KEY: "short-key",
      AUTH_SECRET: undefined,
      NEXTAUTH_SECRET: undefined,
      ATTENDANCE_CODE_SECRET: undefined,
    },
    async () => {
      const db = fakeAuditDb();

      await assert.rejects(
        () =>
          writeAuditEvent(db, {
            actorId: null,
            action: "ACCOUNT_PENDING",
            entity: "User",
            entityId: "user-1",
            newData: { email: "cadet@mitwpu.edu.in" },
          }),
        (error) => {
          assert.equal(error.statusCode, 500);
          assert.match(error.message, /too short/);
          return true;
        }
      );

      assert.equal(db.calls.length, 0, "the event was not written");
    }
  );
});

test("production never substitutes another secret of the deployment", async () => {
  const other = "another-secret-0123456789abcdef";

  for (const name of [
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "ATTENDANCE_CODE_SECRET",
  ]) {
    await withEnvironment(
      {
        NODE_ENV: "production",
        VERCEL_ENV: undefined,
        AUDIT_HASH_KEY: undefined,
        AUTH_SECRET: undefined,
        NEXTAUTH_SECRET: undefined,
        ATTENDANCE_CODE_SECRET: undefined,
        [name]: other,
      },
      async () => {
        const db = fakeAuditDb();

        await assert.rejects(
          () =>
            writeAuditEvent(db, {
              actorId: null,
              action: "ACCOUNT_PENDING",
              entity: "User",
              entityId: "user-1",
              newData: { email: "cadet@mitwpu.edu.in" },
            }),
          /AUDIT_HASH_KEY is not configured/
        );

        assert.equal(db.calls.length, 0, "the event was not written");
      }
    );
  }
});

test("production refuses a key that repeats another secret", async () => {
  const shared = "a-shared-secret-0123456789abcdef";

  await withEnvironment(
    {
      NODE_ENV: "production",
      VERCEL_ENV: undefined,
      AUDIT_HASH_KEY: shared,
      AUTH_SECRET: shared,
      NEXTAUTH_SECRET: undefined,
      ATTENDANCE_CODE_SECRET: undefined,
    },
    async () => {
      const db = fakeAuditDb();

      await assert.rejects(
        () =>
          writeAuditEvent(db, {
            actorId: null,
            action: "ACCOUNT_PENDING",
            entity: "User",
            entityId: "user-1",
            newData: { email: "cadet@mitwpu.edu.in" },
          }),
        (error) => {
          assert.equal(error.statusCode, 500);
          assert.match(error.message, /dedicated secret/);
          return true;
        }
      );

      assert.equal(db.calls.length, 0, "the event was not written");
    }
  );
});

test("production writes the event with a dedicated key", async () => {
  await withEnvironment(
    {
      NODE_ENV: "production",
      VERCEL_ENV: undefined,
      AUDIT_HASH_KEY: DEDICATED_KEY,
      AUTH_SECRET: undefined,
      NEXTAUTH_SECRET: undefined,
      ATTENDANCE_CODE_SECRET: undefined,
    },
    async () => {
      const db = fakeAuditDb();

      await writeAuditEvent(db, {
        actorId: null,
        action: "ACCOUNT_PENDING",
        entity: "User",
        entityId: "user-1",
        newData: { email: "cadet@mitwpu.edu.in" },
      });

      assert.equal(db.calls.length, 1, "the event was written");
      assert.match(db.calls[0].data.newData.email, /^hmac:[a-f0-9]{32}$/);
      assert.ok(
        !db.calls[0].data.newData.email.includes("cadet@mitwpu.edu.in"),
        "the address is never stored"
      );
    }
  );
});

test("development keeps the fallback and writes a warning", async () => {
  const warnings = [];
  const originalWarn = console.warn;

  console.warn = (...args) => {
    warnings.push(args.join(" "));
  };

  try {
    await withEnvironment(
      {
        NODE_ENV: "development",
        VERCEL_ENV: undefined,
        AUDIT_HASH_KEY: undefined,
        AUTH_SECRET: undefined,
        NEXTAUTH_SECRET: undefined,
        ATTENDANCE_CODE_SECRET: undefined,
      },
      async () => {
        const redaction = await freshRedactionModule();
        const reference = redaction.emailReference("cadet@mitwpu.edu.in");

        assert.match(reference, /^hmac:[a-f0-9]{32}$/);
        assert.equal(
          warnings.length,
          1,
          "the missing key is reported"
        );
        assert.match(warnings[0], /AUDIT_HASH_KEY is not configured/);
      }
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("the reference is the same in two separate processes when the key is configured", () => {
  const first = referenceInSeparateProcess({
    NODE_ENV: "production",
    AUDIT_HASH_KEY: DEDICATED_KEY,
  });

  const second = referenceInSeparateProcess({
    NODE_ENV: "production",
    AUDIT_HASH_KEY: DEDICATED_KEY,
  });

  assert.match(first, /^hmac:[a-f0-9]{32}$/);
  assert.equal(
    first,
    second,
    "the same address has the same reference in every process"
  );
});

test("the reference is different in two separate processes without a key", () => {
  const first = referenceInSeparateProcess({ NODE_ENV: "development" });
  const second = referenceInSeparateProcess({ NODE_ENV: "development" });

  assert.match(first, /^hmac:[a-f0-9]{32}$/);
  assert.notEqual(
    first,
    second,
    "the development fallback is a key of the process and cannot be correlated"
  );
});
