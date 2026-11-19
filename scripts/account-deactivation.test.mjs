import assert from "node:assert/strict";
import { test } from "node:test";

import { createFakeDb, addUser } from "./helpers/fake-db.mjs";
import {
  deactivateAccount,
  reactivateAccount,
  resolveGoogleAccount,
  setApprovalStatus,
  SIGN_IN_REJECTIONS,
} from "../src/lib/account-service.mjs";

/**
 * The account lifecycle of the phase 3.5.3.
 *
 * These tests use the in-memory fixture database of `scripts/helpers`. They
 * cover the rules of the service. The atomicity of the transaction and the
 * preservation of the attendance and the leave history are tested against
 * PostgreSQL in `scripts/deactivation-db.test.mjs`.
 */

function setup() {
  const db = createFakeDb();
  const admin = addUser(db, {
    id: "admin-1",
    role: "ADMIN",
    email: "admin@mitwpu.edu.in",
  });
  const cadet = addUser(db, {
    id: "cadet-1",
    email: "cadet@mitwpu.edu.in",
  });

  return { db, admin, cadet };
}

test("an administrator can deactivate a cadet and the account row is kept", async () => {
  const { db, admin, cadet } = setup();

  const result = await deactivateAccount(db, {
    targetUserId: cadet.id,
    actorId: admin.id,
    reason: "The cadet left the unit after the 2026 intake.",
  });

  assert.equal(result.alreadyDeactivated, false);
  assert.ok(result.user.deactivatedAt instanceof Date);
  assert.equal(result.user.deactivatedById, admin.id);
  assert.equal(
    result.user.deactivationReason,
    "The cadet left the unit after the 2026 intake."
  );

  // The account row is still there and it still belongs to the same cadet.
  const stored = await db.user.findUnique({ where: { id: cadet.id } });
  assert.ok(stored, "the account row must not be removed");
  assert.equal(stored.email, "cadet@mitwpu.edu.in");
  assert.equal(stored.name, cadet.name);

  // The approval state is not changed by a deactivation.
  assert.equal(stored.approvalStatus, "APPROVED");
});

test("the deactivation is audited with the acting administrator", async () => {
  const { db, admin, cadet } = setup();

  await deactivateAccount(db, {
    targetUserId: cadet.id,
    actorId: admin.id,
    reason: "Left the unit.",
  });

  const events = db.state.audit.filter(
    (entry) => entry.action === "ACCOUNT_DEACTIVATED"
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].userId, admin.id);
  assert.equal(events[0].entity, "User");
  assert.equal(events[0].entityId, cadet.id);
  assert.equal(events[0].oldData.deactivatedAt, null);
  assert.ok(events[0].newData.deactivatedAt);
});

test("an already deactivated account is reported and nothing is written twice", async () => {
  const { db, admin, cadet } = setup();

  await deactivateAccount(db, {
    targetUserId: cadet.id,
    actorId: admin.id,
  });

  const second = await deactivateAccount(db, {
    targetUserId: cadet.id,
    actorId: admin.id,
  });

  assert.equal(second.alreadyDeactivated, true);
  assert.ok(second.user.deactivatedAt instanceof Date);

  const events = db.state.audit.filter(
    (entry) => entry.action === "ACCOUNT_DEACTIVATED"
  );

  assert.equal(events.length, 1);
});

test("the last active administrator cannot be deactivated", async () => {
  const { db, admin } = setup();

  await assert.rejects(
    () =>
      deactivateAccount(db, {
        targetUserId: admin.id,
        actorId: "admin-2",
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /last active administrator/i);
      return true;
    }
  );

  const stored = await db.user.findUnique({ where: { id: admin.id } });
  assert.equal(stored.deactivatedAt, null);
});

test("an administrator can deactivate another administrator", async () => {
  const { db, admin } = setup();
  const secondAdmin = addUser(db, {
    id: "admin-2",
    role: "ADMIN",
    email: "admin-2@mitwpu.edu.in",
  });

  const result = await deactivateAccount(db, {
    targetUserId: secondAdmin.id,
    actorId: admin.id,
  });

  assert.equal(result.alreadyDeactivated, false);
  assert.ok(result.user.deactivatedAt instanceof Date);
});

test("an administrator cannot deactivate their own account", async () => {
  const { db, admin } = setup();

  await assert.rejects(
    () =>
      deactivateAccount(db, {
        targetUserId: admin.id,
        actorId: admin.id,
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /own account/i);
      return true;
    }
  );
});

test("an unknown account is reported as not found", async () => {
  const { db, admin } = setup();

  await assert.rejects(
    () =>
      deactivateAccount(db, {
        targetUserId: "does-not-exist",
        actorId: admin.id,
      }),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});

test("a deactivated account cannot sign in again", async () => {
  const { db, admin, cadet } = setup();

  await deactivateAccount(db, {
    targetUserId: cadet.id,
    actorId: admin.id,
  });

  const result = await resolveGoogleAccount(db, {
    provider: "google",
    email: cadet.email,
    emailVerified: true,
    name: cadet.name,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, SIGN_IN_REJECTIONS.ACCOUNT_DEACTIVATED);

  // The account is not reactivated by the failed sign in.
  const stored = await db.user.findUnique({ where: { id: cadet.id } });
  assert.ok(stored.deactivatedAt instanceof Date);
});

test("a deactivated account cannot be approved", async () => {
  const { db, admin, cadet } = setup();

  await deactivateAccount(db, {
    targetUserId: cadet.id,
    actorId: admin.id,
  });

  await assert.rejects(
    () =>
      setApprovalStatus(db, {
        targetUserId: cadet.id,
        status: "APPROVED",
        actorId: admin.id,
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /deactivated account cannot be approved/i);
      return true;
    }
  );
});

test("a reactivation lifts the deactivation and is audited", async () => {
  const { db, admin, cadet } = setup();

  await deactivateAccount(db, {
    targetUserId: cadet.id,
    actorId: admin.id,
    reason: "Left the unit.",
  });

  const result = await reactivateAccount(db, {
    targetUserId: cadet.id,
    actorId: admin.id,
  });

  assert.equal(result.alreadyActive, false);
  assert.equal(result.user.deactivatedAt, null);
  assert.equal(result.user.deactivatedById, null);
  assert.equal(result.user.deactivationReason, null);

  // The approval state of the account was not touched by the reactivation.
  assert.equal(result.user.approvalStatus, "APPROVED");

  const events = db.state.audit.filter(
    (entry) => entry.action === "ACCOUNT_REACTIVATED"
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].entityId, cadet.id);
});

test("an active account is reported as already active by a reactivation", async () => {
  const { db, admin, cadet } = setup();

  const result = await reactivateAccount(db, {
    targetUserId: cadet.id,
    actorId: admin.id,
  });

  assert.equal(result.alreadyActive, true);
  assert.equal(
    db.state.audit.filter((entry) => entry.action === "ACCOUNT_REACTIVATED")
      .length,
    0
  );
});

test("a deactivated account is not counted as an active administrator", async () => {
  const { db, admin } = setup();
  const secondAdmin = addUser(db, {
    id: "admin-2",
    role: "ADMIN",
    email: "admin-2@mitwpu.edu.in",
  });

  await deactivateAccount(db, {
    targetUserId: secondAdmin.id,
    actorId: admin.id,
  });

  const active = await db.user.count({
    where: { role: "ADMIN", deactivatedAt: null },
  });

  assert.equal(active, 1);

  // The only remaining administrator cannot be deactivated.
  await assert.rejects(
    () =>
      deactivateAccount(db, {
        targetUserId: admin.id,
        actorId: "admin-3",
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});
