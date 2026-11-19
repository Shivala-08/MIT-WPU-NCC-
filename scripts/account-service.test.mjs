import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SIGN_IN_REJECTIONS,
  resolveGoogleAccount,
  setApprovalStatus,
} from "../src/lib/account-service.mjs";

const DOMAINS = ["mitwpu.edu.in"];
const FIXED_TIME = new Date("2026-10-29T00:00:00.000Z");

function createFixtureDb({ users = [], roster = [] } = {}) {
  const state = {
    users: users.map((user) => ({ ...user })),
    roster: roster.map((entry) => ({ ...entry })),
    profiles: [],
    audits: [],
    counter: 0,
  };

  const db = {
    state,
    user: {
      async findUnique({ where }) {
        return (
          state.users.find(
            (user) => user.id === where.id || user.email === where.email
          ) ?? null
        );
      },
      async create({ data }) {
        state.counter += 1;
        const user = {
          id: `user_${state.counter}`,
          name: data.name,
          email: data.email,
          role: data.role,
          image: data.image ?? null,
          approvalStatus: data.approvalStatus,
          approvedAt: data.approvedAt ?? null,
          approvedById: data.approvedById ?? null,
          rejectionReason: data.rejectionReason ?? null,
          emailVerifiedAt: data.emailVerifiedAt ?? null,
          rosterId: data.rosterId ?? null,
          deactivatedAt: data.deactivatedAt ?? null,
          deactivatedById: data.deactivatedById ?? null,
          deactivationReason: data.deactivationReason ?? null,
        };
        state.users.push(user);
        return user;
      },
      async update({ where, data }) {
        const user = state.users.find((entry) => entry.id === where.id);
        if (!user) {
          throw new Error("user not found");
        }
        Object.assign(user, data);
        return user;
      },
    },
    roster: {
      async findUnique({ where }) {
        return state.roster.find((entry) => entry.email === where.email) ?? null;
      },
    },
    cadetProfile: {
      async findUnique({ where }) {
        return (
          state.profiles.find((profile) => profile.userId === where.userId) ?? null
        );
      },
      async create({ data }) {
        state.counter += 1;
        const profile = {
          id: `profile_${state.counter}`,
          status: "PENDING",
          ...data,
        };
        state.profiles.push(profile);
        return profile;
      },
      async update({ where, data }) {
        const profile = state.profiles.find(
          (entry) => entry.userId === where.userId
        );

        if (!profile) {
          throw new Error("profile not found");
        }

        Object.assign(profile, data);
        return profile;
      },
      async updateMany() {
        return { count: 0 };
      },
    },
    auditLog: {
      async create({ data }) {
        state.audits.push(data);
        return data;
      },
    },
  };

  return db;
}

function existingUser(overrides = {}) {
  return {
    id: "user_existing",
    name: "Existing Cadet",
    email: "cadet@mitwpu.edu.in",
    role: "CADET",
    image: null,
    approvalStatus: "PENDING",
    approvedAt: null,
    approvedById: null,
    rejectionReason: null,
    emailVerifiedAt: null,
    rosterId: null,
    ...overrides,
  };
}

test("a new college account is created as a pending cadet", async () => {
  const db = createFixtureDb();

  const result = await resolveGoogleAccount(db, {
    email: "new.cadet@mitwpu.edu.in",
    emailVerified: true,
    name: "New Cadet",
    allowedEmailDomains: DOMAINS,
    now: () => FIXED_TIME,
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.role, "CADET");
  assert.equal(result.user.approvalStatus, "PENDING");
  assert.equal(result.user.email, "new.cadet@mitwpu.edu.in");
  assert.equal(result.user.emailVerifiedAt, FIXED_TIME);
  assert.equal(result.user.approvedAt, null);
  assert.equal(db.state.users.length, 1);
});

test("a roster matched college account is approved automatically", async () => {
  const db = createFixtureDb({
    roster: [
      {
        id: "roster_1",
        email: "roster.cadet@mitwpu.edu.in",
        fullName: "Roster Cadet",
        active: true,
      },
    ],
  });

  const result = await resolveGoogleAccount(db, {
    email: "Roster.Cadet@mitwpu.edu.in",
    emailVerified: true,
    name: "Roster Cadet",
    allowedEmailDomains: DOMAINS,
    now: () => FIXED_TIME,
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.approvalStatus, "APPROVED");
  assert.equal(result.user.rosterId, "roster_1");
  assert.equal(result.user.approvedAt, FIXED_TIME);
  assert.equal(result.source, "AUTOMATIC");
  assert.equal(result.autoApproved, true);
});

test("a personal gmail account is refused and no row is created", async () => {
  const db = createFixtureDb();

  const result = await resolveGoogleAccount(db, {
    email: "student@gmail.com",
    emailVerified: true,
    allowedEmailDomains: DOMAINS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, SIGN_IN_REJECTIONS.EMAIL_NOT_ALLOWED);
  assert.equal(db.state.users.length, 0);
});

test("other domains outside the college domain are refused", async () => {
  const db = createFixtureDb();

  for (const email of [
    "someone@outlook.com",
    "someone@mitwpu.edu.in.evil.com",
    "someone@sub.mitwpu.edu.in",
  ]) {
    const result = await resolveGoogleAccount(db, {
      email,
      emailVerified: true,
      allowedEmailDomains: DOMAINS,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, SIGN_IN_REJECTIONS.EMAIL_NOT_ALLOWED);
  }

  assert.equal(db.state.users.length, 0);
});

test("an unverified google email is refused", async () => {
  const db = createFixtureDb();

  const unverified = await resolveGoogleAccount(db, {
    email: "cadet@mitwpu.edu.in",
    emailVerified: false,
    allowedEmailDomains: DOMAINS,
  });
  const missing = await resolveGoogleAccount(db, {
    email: "cadet@mitwpu.edu.in",
    emailVerified: undefined,
    allowedEmailDomains: DOMAINS,
  });

  assert.equal(unverified.reason, SIGN_IN_REJECTIONS.EMAIL_NOT_VERIFIED);
  assert.equal(missing.reason, SIGN_IN_REJECTIONS.EMAIL_NOT_VERIFIED);
  assert.equal(db.state.users.length, 0);
});

test("another provider is refused", async () => {
  const db = createFixtureDb();

  const result = await resolveGoogleAccount(db, {
    provider: "credentials",
    email: "cadet@mitwpu.edu.in",
    emailVerified: true,
    allowedEmailDomains: DOMAINS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, SIGN_IN_REJECTIONS.PROVIDER_NOT_ALLOWED);
});

test("a caller supplied id, role or approval state is ignored", async () => {
  const db = createFixtureDb();

  const result = await resolveGoogleAccount(db, {
    email: "new.cadet@mitwpu.edu.in",
    emailVerified: true,
    name: "New Cadet",
    allowedEmailDomains: DOMAINS,
    id: "attacker_supplied_id",
    role: "ADMIN",
    approvalStatus: "APPROVED",
    userId: "attacker_supplied_id",
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.role, "CADET");
  assert.equal(result.user.approvalStatus, "PENDING");
  assert.notEqual(result.user.id, "attacker_supplied_id");
});

test("an existing pending account is approved when it is on the roster", async () => {
  const db = createFixtureDb({
    users: [existingUser()],
    roster: [
      {
        id: "roster_2",
        email: "cadet@mitwpu.edu.in",
        fullName: "Existing Cadet",
        active: true,
      },
    ],
  });

  const result = await resolveGoogleAccount(db, {
    email: "cadet@mitwpu.edu.in",
    emailVerified: true,
    allowedEmailDomains: DOMAINS,
    now: () => FIXED_TIME,
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.approvalStatus, "APPROVED");
  assert.equal(result.user.rosterId, "roster_2");
  assert.equal(result.source, "AUTOMATIC");
  assert.equal(result.autoApproved, true);
});

test("a rejected account is never approved by the roster", async () => {
  const db = createFixtureDb({
    users: [existingUser({ approvalStatus: "REJECTED" })],
    roster: [
      {
        id: "roster_3",
        email: "cadet@mitwpu.edu.in",
        fullName: "Existing Cadet",
        active: true,
      },
    ],
  });

  const result = await resolveGoogleAccount(db, {
    email: "cadet@mitwpu.edu.in",
    emailVerified: true,
    allowedEmailDomains: DOMAINS,
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.approvalStatus, "REJECTED");
  assert.equal(result.user.rosterId, null);
});

test("an inactive roster row does not approve an account", async () => {
  const db = createFixtureDb({
    users: [existingUser()],
    roster: [
      {
        id: "roster_4",
        email: "cadet@mitwpu.edu.in",
        fullName: "Existing Cadet",
        active: false,
      },
    ],
  });

  const result = await resolveGoogleAccount(db, {
    email: "cadet@mitwpu.edu.in",
    emailVerified: true,
    allowedEmailDomains: DOMAINS,
  });

  assert.equal(result.user.approvalStatus, "PENDING");
});

test("an approved account stays approved and keeps its stored role", async () => {
  const db = createFixtureDb({
    users: [existingUser({ approvalStatus: "APPROVED", role: "ADMIN" })],
  });

  const result = await resolveGoogleAccount(db, {
    email: "cadet@mitwpu.edu.in",
    emailVerified: true,
    allowedEmailDomains: DOMAINS,
  });

  assert.equal(result.user.approvalStatus, "APPROVED");
  assert.equal(result.user.role, "ADMIN");
});

test("a pre-registered account records the google email verification", async () => {
  const db = createFixtureDb({ users: [existingUser()] });

  const result = await resolveGoogleAccount(db, {
    email: "cadet@mitwpu.edu.in",
    emailVerified: true,
    allowedEmailDomains: DOMAINS,
    now: () => FIXED_TIME,
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.emailVerifiedAt, FIXED_TIME);
  assert.equal(result.user.approvalStatus, "PENDING");
});

test("the admin approval writes the authoritative state and an audit trail", async () => {
  const db = createFixtureDb({ users: [existingUser()] });

  const updated = await setApprovalStatus(db, {
    targetUserId: "user_existing",
    status: "APPROVED",
    actorId: "admin_1",
    now: () => FIXED_TIME,
  });

  assert.equal(updated.approvalStatus, "APPROVED");
  assert.equal(updated.approvedAt, FIXED_TIME);
  assert.equal(updated.approvedById, "admin_1");
  assert.equal(db.state.audits.at(-1).action, "ACCOUNT_APPROVED");
  assert.equal(db.state.audits.at(-1).userId, "admin_1");
});

test("the admin rejection stores the reason and clears the approval", async () => {
  const db = createFixtureDb({
    users: [existingUser({ approvalStatus: "APPROVED", approvedAt: FIXED_TIME })],
  });

  const updated = await setApprovalStatus(db, {
    targetUserId: "user_existing",
    status: "REJECTED",
    actorId: "admin_1",
    rejectionReason: "Not on the unit roster",
    now: () => FIXED_TIME,
  });

  assert.equal(updated.approvalStatus, "REJECTED");
  assert.equal(updated.approvedAt, null);
  assert.equal(updated.rejectionReason, "Not on the unit roster");
  assert.equal(updated.approvedById, "admin_1");
});

test("an unsupported approval state and an unknown account are refused", async () => {
  const db = createFixtureDb({ users: [existingUser()] });

  await assert.rejects(
    () =>
      setApprovalStatus(db, {
        targetUserId: "user_existing",
        status: "BLOCKED",
      }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () =>
      setApprovalStatus(db, {
        targetUserId: "missing_user",
        status: "APPROVED",
      }),
    (error) => error.statusCode === 404
  );
});
