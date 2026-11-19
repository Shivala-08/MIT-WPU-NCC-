/**
 * The audit trail of the unit against a real PostgreSQL.
 *
 * The suite proves the two properties of the trail:
 *
 *   * the trail is complete. A privileged change and its audit event are
 *     written in one transaction, so a change that is not in the trail was
 *     never applied and a change that was applied is in the trail;
 *   * the trail is redacted. The personal data of a cadet is never stored in
 *     it, the values that are operational are stored as they are and the
 *     email address is replaced by a stable reference.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAccount,
  createProfile,
  fixturePrefix,
  openIntegrationDatabase,
  readAuditEvents,
  removeFixtures,
  withFailingAudit,
  withoutAuditTrail,
} from "./helpers/integration.mjs";

import { updateProfileAsAdmin } from "../src/lib/profile-service.mjs";

/**
 * @param {(context: { prisma: any, prefix: string }) => Promise<void>} run
 * @returns {Promise<{ skip: string | null }>}
 */
async function withDatabase(run) {
  const opened = await openIntegrationDatabase();

  if (opened.skip) {
    return { skip: opened.skip };
  }

  const { prisma } = opened;
  const prefix = fixturePrefix("audit");

  try {
    await run({ prisma, prefix });
  } finally {
    await removeFixtures(prisma, prefix).catch(() => undefined);
    await prisma.$disconnect();
  }

  return { skip: null };
}

test("the trail of a profile correction names the fields and never stores the personal data", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const admin = await createAccount(prisma, {
      email: `${prefix}-administrator@mitwpu.edu.in`,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    });

    const cadet = await createAccount(prisma, {
      email: `${prefix}-cadet@mitwpu.edu.in`,
      approvalStatus: "APPROVED",
    });

    const profile = await createProfile(prisma, cadet.id, {
      fullName: "Audit Cadet",
      phone: "9876543210",
      address: "Hostel Block C, MIT World Peace University",
      parentContact: "9876500000",
      emergencyContact: "Guardian 9876500001",
      bloodGroup: "B+",
      gender: "Male",
      height: "172",
      weight: "65",
      prn: "MITWPU20260001",
      regiNumber: "NCC-2026-001",
    });

    const result = await updateProfileAsAdmin(prisma, {
      userId: cadet.id,
      actorId: admin.id,
      values: {
        phone: "9000000000",
        address: "Hostel Block D, MIT World Peace University",
        parentContact: "9000000001",
        emergencyContact: "Guardian 9000000002",
        bloodGroup: "O+",
        gender: "Female",
        height: "170",
        weight: "60",
        prn: "MITWPU20269999",
        regiNumber: "NCC-2026-999",
        wing: "Navy",
      },
    });

    assert.ok(result.changed.length > 0);

    const events = await readAuditEvents(prisma, {
      action: "CADET_PROFILE_UPDATED",
      entityId: profile.id,
    });

    assert.equal(events.length, 1);

    const event = events[0];
    assert.equal(event.entity, "CadetProfile");
    assert.equal(event.userId, admin.id);

    const payload = { ...event.oldData, ...event.newData };
    const serialized = JSON.stringify(payload);

    // The names of the changed fields stay in the trail.
    assert.ok(Array.isArray(payload.changedFields));
    assert.ok(payload.changedFields.includes("phone"));
    assert.ok(payload.changedFields.includes("wing"));

    // The personal data is never stored.
    for (const secret of [
      "9876543210",
      "9000000000",
      "Hostel Block C",
      "Hostel Block D",
      "9876500000",
      "9000000001",
      "9876500001",
      "9000000002",
      "Audit Cadet",
      "MITWPU20260001",
      "MITWPU20269999",
      "NCC-2026-001",
      "NCC-2026-999",
    ]) {
      assert.ok(
        !serialized.includes(secret),
        `the trail never stores "${secret}"`
      );
    }

    // The values of the personal fields are replaced, the key stays.
    assert.equal(payload.phone, "[redacted]");
    assert.equal(payload.address, "[redacted]");
    assert.equal(payload.parentContact, "[redacted]");
    assert.equal(payload.emergencyContact, "[redacted]");
    assert.equal(payload.bloodGroup, "[redacted]");
    assert.equal(payload.gender, "[redacted]");
    assert.equal(payload.height, "[redacted]");
    assert.equal(payload.weight, "[redacted]");

    // The identifier is masked and only the last two characters survive.
    assert.equal(event.oldData.prn, "************01");
    assert.equal(event.newData.prn, "************99");
    assert.equal(event.oldData.regiNumber, "**********01");
    assert.equal(event.newData.regiNumber, "**********99");

    // The operational value is stored as it is.
    assert.equal(payload.wing, "Navy");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("the email address of a cadet is a stable reference and never a value", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const action = `TEST_${prefix}_REFERENCE`;
    const { writeAuditEvent } = await import("../src/lib/audit-writer.mjs");
    const { emailReference } = await import("../src/lib/audit-redaction.mjs");

    const email = `${prefix}-reference@mitwpu.edu.in`;

    await writeAuditEvent(prisma, {
      actorId: null,
      action,
      entity: "User",
      entityId: null,
      oldData: null,
      newData: { email },
    });

    const events = await readAuditEvents(prisma, { action });

    assert.equal(events.length, 1);

    const stored = events[0].newData.email;

    assert.ok(
      !stored.includes(email),
      "the trail never stores the email address"
    );
    assert.match(stored, /^hmac:[a-f0-9]{32}$/);

    // The same address always produces the same reference.
    assert.equal(stored, emailReference(email));

    // A different address produces a different reference.
    assert.notEqual(stored, emailReference(`${prefix}-other@mitwpu.edu.in`));
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("the credentials, the tokens and the private paths of the storage never reach the trail", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const action = `TEST_${prefix}_SECRETS`;
    const { writeAuditEvent } = await import("../src/lib/audit-writer.mjs");

    await writeAuditEvent(prisma, {
      actorId: null,
      action,
      entity: "User",
      entityId: null,
      oldData: null,
      newData: {
        password: "$2a$12$hashhashhashhashhashhashhashhashhash",
        passwordHash: "$2a$12$hashhashhashhashhashhashhashhashhash",
        token: "a-secret-session-token",
        sessionToken: "another-secret-token",
        tokenHash: "another-secret-hash",
        codeHash: "another-secret-code-hash",
        apiKey: "sk-live-secret",
        secret: "the-session-secret",
        authSecret: "the-auth-secret",
        privateKey: "-----BEGIN PRIVATE KEY-----",
        photoUrl: "profiles/cadet/token.webp",
        photoThumbnailUrl: "profiles/cadet/token-thumb.webp",
        status: "APPROVED",
      },
    });

    const events = await readAuditEvents(prisma, { action });

    assert.equal(events.length, 1);

    const payload = events[0].newData;

    for (const key of [
      "password",
      "passwordHash",
      "token",
      "sessionToken",
      "tokenHash",
      "codeHash",
      "apiKey",
      "secret",
      "authSecret",
      "privateKey",
      "photoUrl",
      "photoThumbnailUrl",
    ]) {
      assert.equal(
        payload[key],
        undefined,
        `the key "${key}" never reaches the trail`
      );
    }

    // The operational value survives.
    assert.equal(payload.status, "APPROVED");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("the free text of a reason is scrubbed from the personal data it carries", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const action = `TEST_${prefix}_FREE_TEXT`;
    const { writeAuditEvent } = await import("../src/lib/audit-writer.mjs");

    await writeAuditEvent(prisma, {
      actorId: null,
      action,
      entity: "User",
      entityId: null,
      oldData: null,
      newData: {
        reason:
          "The cadet called cadet.senior@mitwpu.edu.in and the number 9876543210 was given.",
        notes: "PRN MITWPU/2026/1234 was read out.",
      },
    });

    const events = await readAuditEvents(prisma, { action });

    assert.equal(events.length, 1);

    const reason = events[0].newData.reason;
    const notes = events[0].newData.notes;

    assert.ok(!reason.includes("cadet.senior@mitwpu.edu.in"));
    assert.match(reason, /hmac:[a-f0-9]{32}/);
    assert.ok(!reason.includes("9876543210"));
    assert.ok(!notes.includes("MITWPU/2026/1234"));
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a privileged change without a writable trail is refused", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const cadet = await createAccount(prisma, {
      email: `${prefix}-no-trail@mitwpu.edu.in`,
      approvalStatus: "APPROVED",
    });

    await createProfile(prisma, cadet.id, { fullName: "No Trail Cadet" });

    // A client without a trail cannot write the audit event, so the change
    // is not applied.
    const withoutTrail = withoutAuditTrail(prisma);

    await assert.rejects(
      () =>
        updateProfileAsAdmin(withoutTrail, {
          userId: cadet.id,
          actorId: null,
          values: { phone: "9000000000" },
        }),
      /audit trail is not available/i
    );

    const stored = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { phone: true },
    });

    assert.equal(stored.phone, null, "the change was not applied");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a failing trail rolls the correction of a profile back", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const admin = await createAccount(prisma, {
      email: `${prefix}-administrator@mitwpu.edu.in`,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    });

    const cadet = await createAccount(prisma, {
      email: `${prefix}-cadet@mitwpu.edu.in`,
      approvalStatus: "APPROVED",
    });

    await createProfile(prisma, cadet.id, {
      fullName: "Rollback Cadet",
      phone: "9876543210",
    });

    const failing = withFailingAudit(prisma);

    await assert.rejects(
      () =>
        updateProfileAsAdmin(failing, {
          userId: cadet.id,
          actorId: admin.id,
          values: { phone: "9000000000" },
        }),
      /audit trail refused the write/i
    );

    const stored = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { id: true, phone: true },
    });

    assert.equal(stored.phone, "9876543210", "the correction was rolled back");

    const events = await readAuditEvents(prisma, {
      action: "CADET_PROFILE_UPDATED",
      entityId: stored.id,
    });

    assert.equal(events.length, 0);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});
