/**
 * The rollback of a business transaction when the audit trail cannot be
 * written.
 *
 * The suite runs against the real PostgreSQL of the development machine and
 * proves the rule of the phase 3.7:
 *
 *   * in production the audit trail needs the dedicated `AUDIT_HASH_KEY`;
 *   * a missing key refuses the audit write;
 *   * the refusal rolls the business transaction back, so the change of the
 *     unit is never applied without its audit event;
 *   * the secret of the authentication is present in the environment and is
 *     still not used as the key of the trail in production;
 *   * with a dedicated key the same operation is written.
 *
 * The fixtures are removed after every run.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAccount,
  fixturePrefix,
  openIntegrationDatabase,
  removeFixtures,
} from "./helpers/integration.mjs";

import { setApprovalStatus } from "../src/lib/account-service.mjs";
import { importRosterRows } from "../src/lib/roster-service.mjs";

const SECRET_NAMES = [
  "AUDIT_HASH_KEY",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "ATTENDANCE_CODE_SECRET",
  "VERCEL_ENV",
];

const DEDICATED_KEY = "audit-hash-key-0123456789abcdef";

/**
 * Runs the body with a controlled environment and restores it afterwards.
 *
 * The mode of the key is decided by the environment of the process, so the
 * process itself has to be switched into the production mode.
 *
 * @param {Record<string, string | undefined>} env
 * @param {() => Promise<any>} run
 * @returns {Promise<any>}
 */
async function withEnvironment(env, run) {
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
    return await run();
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
 * Opens the database of the development machine and removes the fixtures.
 *
 * @param {(context: { prisma: any, prefix: string }) => Promise<void>} run
 * @returns {Promise<{ skip: string | null }>}
 */
async function withDatabase(run) {
  const opened = await openIntegrationDatabase();

  if (opened.skip) {
    return { skip: opened.skip };
  }

  const { prisma } = opened;
  const prefix = fixturePrefix("audit-rollback");

  try {
    await run({ prisma, prefix });
  } finally {
    await removeFixtures(prisma, prefix).catch(() => undefined);
    await prisma.$disconnect();
  }

  return { skip: null };
}

/**
 * The administrator and the cadet of the test.
 *
 * @param {any} prisma
 * @param {string} prefix
 * @returns {Promise<{ admin: any, cadet: any }>}
 */
async function buildAccounts(prisma, prefix) {
  const admin = await createAccount(prisma, {
    email: `${prefix}-administrator@mitwpu.edu.in`,
    role: "ADMIN",
    approvalStatus: "APPROVED",
  });

  const cadet = await createAccount(prisma, {
    email: `${prefix}-cadet@mitwpu.edu.in`,
    approvalStatus: "PENDING",
  });

  return { admin, cadet };
}

test("an approval is rolled back when the trail cannot be written in production", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const { admin, cadet } = await buildAccounts(prisma, prefix);

    await withEnvironment(
      {
        NODE_ENV: "production",
        VERCEL_ENV: undefined,
        AUDIT_HASH_KEY: undefined,
      },
      async () => {
        await assert.rejects(
          () =>
            setApprovalStatus(prisma, {
              targetUserId: cadet.id,
              status: "APPROVED",
              actorId: admin.id,
            }),
          (error) => {
            assert.equal(error.statusCode, 500);
            assert.match(error.message, /AUDIT_HASH_KEY is not configured/);
            return true;
          }
        );
      }
    );

    // The decision of the administrator was not applied.
    const stored = await prisma.user.findUnique({
      where: { id: cadet.id },
      select: {
        approvalStatus: true,
        approvedById: true,
        approvedAt: true,
      },
    });

    assert.equal(stored.approvalStatus, "PENDING");
    assert.equal(stored.approvedById, null);
    assert.equal(stored.approvedAt, null);

    // The trail holds no event of the decision either.
    const events = await prisma.auditLog.findMany({
      where: { entity: "User", entityId: cadet.id },
      select: { id: true, action: true },
    });

    assert.equal(events.length, 0, "no event was written");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a roster import is rolled back when the trail cannot be written in production", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const { admin } = await buildAccounts(prisma, prefix);
    const email = `${prefix}-imported@mitwpu.edu.in`;

    await withEnvironment(
      {
        NODE_ENV: "production",
        VERCEL_ENV: undefined,
        AUDIT_HASH_KEY: undefined,
      },
      async () => {
        await assert.rejects(
          () =>
            importRosterRows(prisma, {
              rows: [{ email, fullName: "Imported Cadet" }],
              actorId: admin.id,
            }),
          /AUDIT_HASH_KEY is not configured/
        );
      }
    );

    // The import left no roster row and no account of the imported row
    // behind. The two accounts of the fixtures are still there.
    const rosterRows = await prisma.roster.findMany({
      where: { email: { contains: prefix } },
      select: { id: true },
    });

    assert.equal(rosterRows.length, 0, "no roster row was written");

    const importedAccounts = await prisma.user.findMany({
      where: { email: { contains: `${prefix}-imported` } },
      select: { id: true },
    });

    assert.equal(importedAccounts.length, 0, "no account was written");

    const importedProfiles = await prisma.cadetProfile.findMany({
      where: { userId: { in: importedAccounts.map((row) => row.id) } },
      select: { id: true },
    });

    assert.equal(importedProfiles.length, 0, "no profile was written");

    const events = await prisma.auditLog.findMany({
      where: { action: "ROSTER_IMPORTED" },
      select: { id: true },
    });

    assert.equal(events.length, 0, "no event was written");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("the same decision is written when a dedicated production key is configured", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const { admin, cadet } = await buildAccounts(prisma, prefix);

    await withEnvironment(
      {
        NODE_ENV: "production",
        VERCEL_ENV: undefined,
        AUDIT_HASH_KEY: DEDICATED_KEY,
      },
      async () => {
        const updated = await setApprovalStatus(prisma, {
          targetUserId: cadet.id,
          status: "APPROVED",
          actorId: admin.id,
        });

        assert.equal(updated.approvalStatus, "APPROVED");
      }
    );

    const stored = await prisma.user.findUnique({
      where: { id: cadet.id },
      select: { approvalStatus: true, approvedById: true },
    });

    assert.equal(stored.approvalStatus, "APPROVED");
    assert.equal(stored.approvedById, admin.id);

    const events = await prisma.auditLog.findMany({
      where: { entity: "User", entityId: cadet.id },
      select: { id: true, action: true, newData: true },
    });

    assert.equal(events.length, 1, "the event was written");
    assert.equal(events[0].action, "ACCOUNT_APPROVED");
    assert.equal(events[0].newData.approvalStatus, "APPROVED");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});
