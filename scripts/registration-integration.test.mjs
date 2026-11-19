/**
 * The registration of a cadet against a real PostgreSQL.
 *
 * The suite calls the route of the application, so the schema of the request,
 * the ownership of the fields, the transaction of the registration and the
 * unique constraint of the email address are all proved against the real
 * database.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fixturePrefix,
  openIntegrationDatabase,
  readAuditEvents,
  removeFixtures,
  withFailingAudit,
} from "./helpers/integration.mjs";

import { BASE_URL } from "./helpers/db-suite.mjs";

/**
 * @param {(context: { prisma: any, prefix: string, request: (path: string, body: unknown, init?: RequestInit) => Promise<Response> }) => Promise<void>} run
 * @returns {Promise<{ skip: string | null }>}
 */
async function withDatabase(run) {
  const opened = await openIntegrationDatabase();

  if (opened.skip) {
    return { skip: opened.skip };
  }

  const { prisma } = opened;
  const prefix = fixturePrefix("registration");

  const request = async (path, body, init = {}) => {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
      ...init,
    });

    return response;
  };

  try {
    await run({ prisma, prefix, request });
  } finally {
    await removeFixtures(prisma, prefix).catch(() => undefined);
    await prisma.$disconnect();
  }

  return { skip: null };
}

/**
 * @param {string} email
 * @returns {Record<string, unknown>}
 */
function application(email) {
  return {
    fullName: "Registration Cadet",
    email,
    bloodGroup: "O+",
    gender: "Male",
    phone: "9876543210",
  };
}

test("a registration writes the account, the profile and the audit event in one transaction", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix, request }) => {
    const email = `${prefix}-registered@mitwpu.edu.in`;
    const response = await request("/api/register", application(email));

    assert.equal(response.status, 201);

    const payload = await response.json();
    assert.equal(payload.success, true);

    const account = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        approvalStatus: true,
        password: true,
        emailVerifiedAt: true,
      },
    });

    assert.ok(account, "the account was created");
    assert.equal(account.role, "CADET");
    assert.equal(account.approvalStatus, "PENDING");
    assert.equal(account.password, null, "the account has no usable password");
    assert.equal(account.emailVerifiedAt, null);

    const profile = await prisma.cadetProfile.findUnique({
      where: { userId: account.id },
      select: {
        id: true,
        fullName: true,
        gender: true,
        bloodGroup: true,
        phone: true,
        wing: true,
        prn: true,
        regiNumber: true,
        dob: true,
      },
    });

    assert.ok(profile, "the registration creates the profile");
    assert.equal(profile.fullName, "Registration Cadet");
    assert.equal(profile.gender, "Male");
    assert.equal(profile.bloodGroup, "O+");
    assert.equal(profile.phone, "9876543210");
    assert.equal(profile.wing, null);
    assert.equal(profile.prn, null);
    assert.equal(profile.regiNumber, null);
    assert.equal(profile.dob, null);

    // The registration is in the audit trail.
    const events = await readAuditEvents(prisma, {
      action: "REGISTRATION_SUBMITTED",
      entityId: account.id,
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].entity, "User");
    assert.equal(events[0].newData.approvalStatus, "PENDING");
    assert.equal(events[0].newData.source, "APPLICATION");

    // The email address is never stored as a value in the trail.
    assert.ok(
      !JSON.stringify(events[0]).includes(email),
      "the trail never stores the email address"
    );
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a second registration of the same address is refused and changes nothing", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix, request }) => {
    const email = `${prefix}-duplicate@mitwpu.edu.in`;

    const first = await request("/api/register", application(email));
    assert.equal(first.status, 201);

    const second = await request("/api/register", application(email));
    assert.equal(second.status, 400);

    const payload = await second.json();
    assert.match(payload.error, /already exists/i);

    const accounts = await prisma.user.findMany({
      where: { email },
      select: { id: true },
    });

    assert.equal(accounts.length, 1, "the second registration created nothing");

    const profiles = await prisma.cadetProfile.findMany({
      where: { userId: accounts[0].id },
      select: { id: true },
    });

    assert.equal(profiles.length, 1);

    const events = await readAuditEvents(prisma, {
      action: "REGISTRATION_SUBMITTED",
      entityId: accounts[0].id,
    });

    assert.equal(events.length, 1, "the trail has no second registration");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a registration with a roster owned field is refused and creates nothing", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix, request }) => {
    const email = `${prefix}-foreign@mitwpu.edu.in`;

    const response = await request("/api/register", {
      ...application(email),
      wing: "Army",
      division: "SD",
      year: "1st Year",
      branch: "Computer Science",
      prn: "PRN123",
      regiNumber: "REG123",
      dob: "2006-01-01",
    });

    assert.equal(response.status, 400);

    const payload = await response.json();
    assert.match(payload.error, /maintained by the roster/i);
    assert.ok(Array.isArray(payload.fields));
    assert.equal(payload.fields.length, 7);

    const accounts = await prisma.user.findMany({
      where: { email },
      select: { id: true },
    });

    assert.equal(accounts.length, 0, "nothing was created");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a registration with an impossible date is refused before it reaches the database", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix, request }) => {
    const email = `${prefix}-date@mitwpu.edu.in`;

    const response = await request("/api/register", {
      ...application(email),
      dob: "2006-02-31",
    });

    // The date is checked against the calendar before anything is written.
    assert.equal(response.status, 400);

    const payload = await response.json();
    assert.match(payload.error, /real calendar date|format YYYY-MM-DD/i);

    const accounts = await prisma.user.findMany({
      where: { email },
      select: { id: true },
    });

    assert.equal(accounts.length, 0);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a registration with a valid date of the administrator is refused by the ownership", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix, request }) => {
    const email = `${prefix}-calendar@mitwpu.edu.in`;

    const response = await request("/api/register", {
      ...application(email),
      dob: "2006-01-01",
    });

    assert.equal(response.status, 400);

    const payload = await response.json();
    assert.match(payload.error, /maintained by the admin/i);

    const accounts = await prisma.user.findMany({
      where: { email },
      select: { id: true },
    });

    assert.equal(accounts.length, 0);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a failing audit trail rolls the registration back", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const email = `${prefix}-rollback@mitwpu.edu.in`;

    const { writeAuditEvent } = await import("../src/lib/audit-writer.mjs");
    const { runInTransaction } = await import("../src/lib/db-transaction.mjs");
    const { buildNewProfileData } = await import(
      "../src/lib/profile-fields.mjs"
    );

    const failing = withFailingAudit(prisma);

    // The registration is written the same way the route writes it, with a
    // trail that refuses every write.
    await assert.rejects(
      () =>
        runInTransaction(failing, async (tx) => {
          const user = await tx.user.create({
            data: {
              name: "Rollback Cadet",
              email,
              password: null,
              role: "CADET",
              approvalStatus: "PENDING",
              emailVerifiedAt: null,
              rosterId: null,
              cadetProfile: {
                create: buildNewProfileData({ name: "Rollback Cadet" }, null),
              },
            },
            select: { id: true, email: true, approvalStatus: true },
          });

          await writeAuditEvent(tx, {
            actorId: null,
            action: "REGISTRATION_SUBMITTED",
            entity: "User",
            entityId: user.id,
            oldData: null,
            newData: {
              email: user.email,
              approvalStatus: user.approvalStatus,
              role: "CADET",
              source: "APPLICATION",
            },
          });

          return user;
        }),
      /audit trail refused the write/i
    );

    const accounts = await prisma.user.findMany({
      where: { email },
      select: { id: true },
    });

    assert.equal(accounts.length, 0, "the account was rolled back");

    const profiles = await prisma.cadetProfile.findMany({
      where: { userId: { in: accounts.map((account) => account.id) } },
      select: { id: true },
    });

    assert.equal(profiles.length, 0);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});
