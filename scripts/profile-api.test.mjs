import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASE_URL,
  createPrismaClient,
  loadSuiteContext,
  requireDatabase,
  requireSecret,
  requireServer,
  sessionCookie,
} from "./helpers/db-suite.mjs";

async function withFixtures(run) {
  const context = loadSuiteContext();

  if (context.skip) {
    return { skip: context.skip };
  }

  // The suite runs against the local development environment. A missing
  // secret, a server that does not answer and a database that does not
  // answer are failures and not skips.
  requireSecret(context.secret);
  await requireServer(BASE_URL);

  const prisma = await createPrismaClient(context.env);

  try {
    await requireDatabase(prisma);
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    throw error;
  }

  const stamp = Date.now();
  const emails = {
    admin: `profile-admin-${stamp}@mitwpu.edu.in`,
    officer: `profile-officer-${stamp}@mitwpu.edu.in`,
    cadet: `profile-cadet-${stamp}@mitwpu.edu.in`,
    other: `profile-other-${stamp}@mitwpu.edu.in`,
    pending: `profile-pending-${stamp}@mitwpu.edu.in`,
    rejected: `profile-rejected-${stamp}@mitwpu.edu.in`,
    roster: `profile-roster-${stamp}@mitwpu.edu.in`,
  };

  const create = (email, role, approvalStatus) =>
    prisma.user.create({
      data: {
        name: `Fixture ${email}`,
        email,
        password: null,
        role,
        approvalStatus,
        approvedAt: approvalStatus === "APPROVED" ? new Date() : null,
      },
      select: { id: true, email: true, role: true, approvalStatus: true },
    });

  const fixtures = {};

  try {
    fixtures.admin = await create(emails.admin, "ADMIN", "APPROVED");
    fixtures.officer = await create(emails.officer, "OFFICER", "APPROVED");
    fixtures.cadet = await create(emails.cadet, "CADET", "APPROVED");
    fixtures.other = await create(emails.other, "CADET", "APPROVED");
    fixtures.pending = await create(emails.pending, "CADET", "PENDING");
    fixtures.rejected = await create(emails.rejected, "CADET", "REJECTED");

    await prisma.cadetProfile.create({
      data: {
        userId: fixtures.cadet.id,
        fullName: "Profile Cadet",
        phone: "9876543210",
        wing: "Army",
      },
    });

    await prisma.cadetProfile.create({
      data: {
        userId: fixtures.other.id,
        fullName: "Other Cadet",
        phone: "9000000000",
      },
    });

    const cookieFor = async (user) =>
      sessionCookie(context.secret, user);

    const request = (path, { method = "GET", body, cookie, headers = {} } = {}) =>
      fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
      });

    const result = await run({
      prisma,
      fixtures,
      emails,
      cookieFor,
      get: (path, cookie) => request(path, { cookie }),
      post: (path, body, cookie) => request(path, { method: "POST", body, cookie }),
      patch: (path, body, cookie) => request(path, { method: "PATCH", body, cookie }),
      put: (path, body, cookie) => request(path, { method: "PUT", body, cookie }),
    });

    return { skip: null, result };
  } finally {
    // The audit rows of the fixtures are removed before the accounts, because
    // the actor of an event is a plain reference and it would otherwise stay
    // behind as a dangling id.
    const fixtureUsers = await prisma.user.findMany({
      where: { email: { contains: "profile-" } },
      select: { id: true },
    });
    const fixtureUserIds = fixtureUsers.map((user) => user.id);

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: fixtureUserIds } },
          { entityId: { in: fixtureUserIds } },
        ],
      },
    });
    await prisma.cadetProfile.deleteMany({
      where: { userId: { in: fixtureUserIds } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `profile-` } },
    });
    await prisma.roster.deleteMany({
      where: { email: { contains: `profile-` } },
    });
    await prisma.$disconnect();
  }
}

test("an anonymous caller cannot reach the profile API", async (t) => {
  const outcome = await withFixtures(async ({ get, patch, post }) => {
    const read = await get("/api/profile");
    const update = await patch("/api/profile", { phone: "9876543210" });
    const upload = await post("/api/profile/photo", { photo: "not-a-file" });

    return {
      read: read.status,
      update: update.status,
      upload: upload.status,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.read, 401);
  assert.equal(outcome.result.update, 401);
  assert.equal(outcome.result.upload, 401);
});

test("a pending and a rejected account cannot reach the profile API", async (t) => {
  const outcome = await withFixtures(async ({ get, cookieFor, fixtures }) => {
    const pendingCookie = await cookieFor(fixtures.pending);
    const rejectedCookie = await cookieFor(fixtures.rejected);

    return {
      pending: (await get("/api/profile", pendingCookie)).status,
      rejected: (await get("/api/profile", rejectedCookie)).status,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.pending, 403);
  assert.equal(outcome.result.rejected, 403);
});

test("an approved cadet reads their own profile", async (t) => {
  const outcome = await withFixtures(async ({ get, cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.cadet);
    const response = await get("/api/profile", cookie);
    const payload = await response.json();

    return {
      status: response.status,
      payload: JSON.stringify(payload),
      profile: payload.profile,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.status, 200);
  assert.equal(result.profile.fullName, "Profile Cadet");
  assert.equal(result.profile.completion.percent >= 0, true);
  assert.equal(
    result.payload.includes("password"),
    false,
    "the profile must never carry a password hash"
  );
  assert.equal(
    result.payload.includes("profiles/"),
    false,
    "the profile must never expose a storage path"
  );
});

test("a cadet cannot change a roster controlled field", async (t) => {
  const outcome = await withFixtures(
    async ({ patch, cookieFor, fixtures, prisma }) => {
      const cookie = await cookieFor(fixtures.cadet);

      const locked = await patch("/api/profile", { wing: "Navy" }, cookie);
      const lockedPayload = await locked.json();

      const privilege = await patch(
        "/api/profile",
        {
          userId: fixtures.other.id,
          role: "ADMIN",
          approvalStatus: "APPROVED",
          status: "APPROVED",
        },
        cookie
      );

      const stored = await prisma.cadetProfile.findUnique({
        where: { userId: fixtures.cadet.id },
        select: { wing: true },
      });

      const other = await prisma.cadetProfile.findUnique({
        where: { userId: fixtures.other.id },
        select: { phone: true },
      });

      return {
        locked: locked.status,
        lockedMessage: lockedPayload.error,
        privilege: privilege.status,
        stored,
        otherPhone: other?.phone,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.locked, 400);
  assert.match(result.lockedMessage, /roster/i);
  assert.equal(result.privilege, 400);
  assert.equal(result.stored.wing, "Army");
  assert.equal(result.otherPhone, "9000000000");
});

test("a cadet saves their own personal fields", async (t) => {
  const outcome = await withFixtures(
    async ({ patch, cookieFor, fixtures, prisma }) => {
      const cookie = await cookieFor(fixtures.cadet);
      const response = await patch(
        "/api/profile",
        { phone: "9123456780", address: "MIT WPU Campus" },
        cookie
      );
      const payload = await response.json();

      const stored = await prisma.cadetProfile.findUnique({
        where: { userId: fixtures.cadet.id },
        select: { phone: true, address: true },
      });

      const second = await patch("/api/profile", { phone: "9123456780" }, cookie);

      const storedAfter = await prisma.cadetProfile.findUnique({
        where: { userId: fixtures.cadet.id },
        select: { phone: true, address: true, wing: true },
      });

      return { status: response.status, payload, stored, second: second.status, storedAfter };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 200);
  assert.equal(outcome.result.stored.phone, "9123456780");
  assert.equal(outcome.result.stored.address, "MIT WPU Campus");
  assert.equal(outcome.result.second, 200);
  assert.equal(
    outcome.result.storedAfter.address,
    "MIT WPU Campus",
    "a partial update must not clear the fields that were not sent"
  );
  assert.equal(outcome.result.storedAfter.wing, "Army");
});

test("a cadet cannot use the administrative profile endpoints", async (t) => {
  const outcome = await withFixtures(
    async ({ get, patch, cookieFor, fixtures }) => {
      const cadetCookie = await cookieFor(fixtures.cadet);
      const officerCookie = await cookieFor(fixtures.officer);

      return {
        cadetList: (await get("/api/admin/cadets", cadetCookie)).status,
        cadetDirectory: (await get("/api/admin/profiles", cadetCookie)).status,
        cadetDetail: (
          await get(`/api/admin/cadets/${fixtures.cadet.id}`, cadetCookie)
        ).status,
        cadetPatch: (
          await patch(
            `/api/admin/cadets/${fixtures.cadet.id}`,
            { wing: "Navy" },
            cadetCookie
          )
        ).status,
        officerList: (await get("/api/admin/cadets", officerCookie)).status,
        officerDirectory: (await get("/api/admin/profiles", officerCookie)).status,
        officerDetail: (
          await get(`/api/admin/cadets/${fixtures.cadet.id}`, officerCookie)
        ).status,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.cadetList, 403);
  assert.equal(result.cadetDirectory, 403);
  assert.equal(result.cadetDetail, 403);
  assert.equal(result.cadetPatch, 403);
  assert.equal(result.officerList, 403);
  assert.equal(result.officerDirectory, 403);
  assert.equal(result.officerDetail, 403);
});

test("an administrator cannot change the approval state through the profile route", async (t) => {
  const outcome = await withFixtures(
    async ({ patch, cookieFor, fixtures, prisma }) => {
      const cookie = await cookieFor(fixtures.admin);
      const response = await patch(
        `/api/admin/cadets/${fixtures.pending.id}`,
        { approvalStatus: "APPROVED" },
        cookie
      );

      const stored = await prisma.user.findUnique({
        where: { id: fixtures.pending.id },
        select: { approvalStatus: true },
      });

      return { status: response.status, stored };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 400);
  assert.equal(outcome.result.stored.approvalStatus, "PENDING");
});

test("an administrator corrects a cadet profile and the change is audited", async (t) => {
  const outcome = await withFixtures(
    async ({ patch, cookieFor, fixtures, prisma }) => {
      const cookie = await cookieFor(fixtures.admin);
      const response = await patch(
        `/api/admin/cadets/${fixtures.cadet.id}`,
        { wing: "Navy", division: "SW" },
        cookie
      );

      const stored = await prisma.cadetProfile.findUnique({
        where: { userId: fixtures.cadet.id },
        select: { wing: true, division: true },
      });

      const audit = await prisma.auditLog.findMany({
        where: {
          entityId: (await prisma.cadetProfile.findUnique({
            where: { userId: fixtures.cadet.id },
            select: { id: true },
          })).id,
          action: "CADET_PROFILE_UPDATED",
        },
      });

      return { status: response.status, stored, audit: audit.length };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 200);
  assert.equal(outcome.result.stored.wing, "Navy");
  assert.equal(outcome.result.stored.division, "SW");
  assert.ok(outcome.result.audit >= 1);
});

test("a photo upload rejects an unsupported file and an oversized file", async (t) => {
  const outcome = await withFixtures(async ({ cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.cadet);

    const upload = async (name, type, bytes) => {
      const form = new FormData();
      form.append("photo", new Blob([bytes], { type }), name);

      return fetch(`${BASE_URL}/api/profile/photo`, {
        method: "POST",
        headers: { cookie },
        body: form,
        redirect: "manual",
      });
    };

    const text = await upload(
      "photo.jpg",
      "image/jpeg",
      new Uint8Array([0x74, 0x65, 0x78, 0x74, 0x20, 0x66, 0x69, 0x6c, 0x65, 0x0a])
    );

    const oversized = await upload(
      "photo.png",
      "image/png",
      new Uint8Array(5 * 1024 * 1024 + 16)
    );

    return {
      text: text.status,
      textPayload: await text.json(),
      oversized: oversized.status,
      oversizedPayload: await oversized.json(),
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.text, 400);
  assert.match(result.textPayload.error, /not a supported image|rejected/i);

  // The body is rejected before it is read into the memory of the server.
  // The status code is 413, because the request itself is too large.
  assert.equal(result.oversized, 413);
  assert.match(result.oversizedPayload.error, /smaller than 5 MB|too large/i);
});

test("a cadet uploads a photo and only their own photo changes", async (t) => {
  const outcome = await withFixtures(
    async ({ cookieFor, fixtures, prisma }) => {
      const { default: sharp } = await import("sharp");
      const png = await sharp({
        create: {
          width: 64,
          height: 64,
          channels: 3,
          background: { r: 20, g: 40, b: 90 },
        },
      })
        .png()
        .toBuffer();

      const cookie = await cookieFor(fixtures.cadet);
      const form = new FormData();
      form.append("photo", new Blob([png], { type: "image/png" }), "photo.png");

      const response = await fetch(`${BASE_URL}/api/profile/photo`, {
        method: "POST",
        headers: { cookie },
        body: form,
        redirect: "manual",
      });

      const payload = await response.json();

      const stored = await prisma.cadetProfile.findUnique({
        where: { userId: fixtures.cadet.id },
        select: { photoUrl: true, photoThumbnailUrl: true },
      });

      const other = await prisma.cadetProfile.findUnique({
        where: { userId: fixtures.other.id },
        select: { photoUrl: true },
      });

      const read = await fetch(`${BASE_URL}/api/profile/photo`, {
        headers: { cookie },
        redirect: "manual",
      });

      const anonymous = await fetch(`${BASE_URL}/api/profile/photo`, {
        redirect: "manual",
      });

      return {
        status: response.status,
        payload,
        stored,
        otherPhoto: other?.photoUrl ?? null,
        readStatus: read.status,
        readType: read.headers.get("content-type"),
        anonymousStatus: anonymous.status,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.status, 200);
  assert.equal(result.payload.hasPhoto, true);
  assert.match(result.stored.photoUrl, /^profiles\//);
  assert.match(result.stored.photoThumbnailUrl, /^profiles\//);
  assert.equal(result.otherPhoto, null);
  assert.equal(result.readStatus, 200);
  assert.equal(result.readType, "image/webp");
  assert.equal(result.anonymousStatus, 401);
});

test("an import matches a roster row by the normalised email and syncs the profile", async (t) => {
  const outcome = await withFixtures(
    async ({ post, get, cookieFor, fixtures, emails, prisma }) => {
      const cookie = await cookieFor(fixtures.admin);

      const csv = [
        "email,full name,prn,wing,year",
        `${emails.cadet.toUpperCase()},Roster Cadet,PRN555,Air,3rd Year`,
      ].join("\n");

      const imported = await post("/api/admin/roster", { csv }, cookie);
      const payload = await imported.json();

      const stored = await prisma.roster.findUnique({
        where: { email: emails.cadet },
        select: { email: true, prn: true, wing: true },
      });

      const profile = await prisma.cadetProfile.findUnique({
        where: { userId: fixtures.cadet.id },
        select: { wing: true, year: true, prn: true, phone: true },
      });

      const list = await get("/api/admin/roster?match=matched", cookie);
      const listPayload = await list.json();

      return {
        imported: imported.status,
        payload,
        stored,
        profile,
        listStatus: list.status,
        listed: listPayload.roster?.some(
          (entry) => entry.email === emails.cadet
        ),
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.imported, 200);
  assert.equal(result.payload.matched, 1);
  assert.equal(result.stored.prn, "PRN555");
  assert.equal(result.profile.wing, "Air");
  assert.equal(result.profile.year, "3rd Year");
  assert.equal(result.profile.phone, "9876543210");
  assert.equal(result.listStatus, 200);
  assert.equal(result.listed, true);
});

test("an import never reapproves a rejected account and a deactivation keeps the account", async (t) => {
  const outcome = await withFixtures(
    async ({ post, patch, cookieFor, fixtures, emails, prisma }) => {
      const cookie = await cookieFor(fixtures.admin);

      const csv = [
        "email,full name,prn,wing,year",
        `${emails.rejected},Rejected Cadet,PRN666,Army,1st Year`,
      ].join("\n");

      const imported = await post("/api/admin/roster", { csv }, cookie);

      const afterImport = await prisma.user.findUnique({
        where: { id: fixtures.rejected.id },
        select: { approvalStatus: true, role: true },
      });

      const rosterRow = await prisma.roster.findUnique({
        where: { email: emails.rejected },
        select: { id: true },
      });

      const deactivated = await patch(
        "/api/admin/roster",
        { rosterId: rosterRow.id, active: false },
        cookie
      );

      const afterDeactivation = await prisma.user.findUnique({
        where: { id: fixtures.rejected.id },
        select: { approvalStatus: true, role: true },
      });

      const rosterAfter = await prisma.roster.findUnique({
        where: { id: rosterRow.id },
        select: { active: true },
      });

      return {
        imported: imported.status,
        afterImport,
        deactivated: deactivated.status,
        afterDeactivation,
        rosterActive: rosterAfter.active,
        userCount: await prisma.user.count({
          where: { id: fixtures.rejected.id },
        }),
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.imported, 200);
  assert.equal(result.afterImport.approvalStatus, "REJECTED");
  assert.equal(result.afterDeactivation.approvalStatus, "REJECTED");
  assert.equal(result.afterDeactivation.role, "CADET");
  assert.equal(result.deactivated, 200);
  assert.equal(result.rosterActive, false);
  assert.equal(result.userCount, 1);
});
