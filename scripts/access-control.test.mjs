import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

const REPO_ROOT = resolve(import.meta.dirname, "..");

async function withFixtures(run) {
  const context = loadSuiteContext();

  if (context.skip) {
    return { skip: context.skip };
  }

  // The suite runs against the local development environment. A missing
  // secret, a server that does not answer and a database that does not
  // answer are failures: a suite that skips in a broken environment reports
  // a green result while it proved nothing.
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
    admin: `access-admin-${stamp}@mitwpu.edu.in`,
    officer: `access-officer-${stamp}@mitwpu.edu.in`,
    approved: `access-approved-${stamp}@mitwpu.edu.in`,
    pending: `access-pending-${stamp}@mitwpu.edu.in`,
    rejected: `access-rejected-${stamp}@mitwpu.edu.in`,
    registered: `access-registered-${stamp}@mitwpu.edu.in`,
    staleRole: `access-stale-${stamp}@mitwpu.edu.in`,
    changedRole: `access-changed-${stamp}@mitwpu.edu.in`,
    roster: `access-roster-${stamp}@mitwpu.edu.in`,
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
    fixtures.approved = await create(emails.approved, "CADET", "APPROVED");
    fixtures.pending = await create(emails.pending, "CADET", "PENDING");
    fixtures.rejected = await create(emails.rejected, "CADET", "REJECTED");
    fixtures.staleRole = await create(emails.staleRole, "CADET", "APPROVED");
    fixtures.changedRole = await create(emails.changedRole, "ADMIN", "APPROVED");

    const cookieFor = async (user, roleOverride) =>
      sessionCookie(context.secret, user, roleOverride);

    const result = await run({
      prisma,
      fixtures,
      emails,
      cookieFor,
      get: (path, cookie) =>
        fetch(`${BASE_URL}${path}`, {
          headers: cookie ? { cookie } : {},
          redirect: "manual",
        }),
      post: (path, body, cookie) =>
        fetch(`${BASE_URL}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify(body),
          redirect: "manual",
        }),
      patch: (path, body, cookie) =>
        fetch(`${BASE_URL}${path}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify(body),
          redirect: "manual",
        }),
    });

    return { skip: null, result };
  } finally {
    // The cleanup is ordered so that the foreign keys of the schema are
    // respected. Every row that points at a fixture account goes first, the
    // profile of a cadet goes before the account and the account goes last.
    const fixtureUsers = await prisma.user.findMany({
      where: { email: { contains: "access-" } },
      select: { id: true },
    });
    const fixtureUserIds = fixtureUsers.map((user) => user.id);

    const fixtureSessions = await prisma.attendanceSession.findMany({
      where: {
        title: {
          in: [
            "Approved roll call",
            "Pending roll call",
            "Unknown roll call",
            "Bad status roll call",
          ],
        },
      },
      select: { id: true },
    });
    const fixtureSessionIds = fixtureSessions.map((session) => session.id);

    const fixtureAttendances = await prisma.attendance.findMany({
      where: { userId: { in: fixtureUserIds } },
      select: { id: true },
    });
    const fixtureAttendanceIds = fixtureAttendances.map((row) => row.id);

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: fixtureUserIds } },
          // An event of a fixture account is removed by the account it
          // points at, even when the event has no actor. The registration
          // event of the applicant is such an event: it has no actor and its
          // payload carries the address of the applicant as a reference, so
          // the payload cannot be searched for it.
          { entityId: { in: [...fixtureUserIds, ...fixtureSessionIds, ...fixtureAttendanceIds] } },
        ],
      },
    });
    await prisma.leaveRequest.deleteMany({
      where: { userId: { in: fixtureUserIds } },
    });
    await prisma.attendance.deleteMany({
      where: { userId: { in: fixtureUserIds } },
    });
    await prisma.attendanceManualCode.deleteMany({
      where: { sessionId: { in: fixtureSessionIds } },
    });
    await prisma.attendanceQrToken.deleteMany({
      where: { sessionId: { in: fixtureSessionIds } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { id: { in: fixtureSessionIds } },
    });
    await prisma.cadetProfile.deleteMany({
      where: { userId: { in: fixtureUserIds } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `access-` } },
    });
    await prisma.roster.deleteMany({
      where: { email: { contains: `access-` } },
    });
    await prisma.$disconnect();
  }
}

function locationOf(response) {
  return response.headers.get("location") ?? "";
}

test("an anonymous caller cannot reach the protected pages and APIs", async (t) => {
  const outcome = await withFixtures(async ({ get }) => {
    const dashboard = await get("/dashboard");
    const adminApi = await get("/api/admin/cadets");
    const download = await get("/api/study-materials/download/drill-manual-1");

    return {
      dashboard: { status: dashboard.status, location: locationOf(dashboard) },
      adminApi: adminApi.status,
      download: download.status,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.dashboard.status, 307);
  assert.match(result.dashboard.location, /\/login/);
  assert.equal(result.adminApi, 401);
  assert.equal(result.download, 401);
});

test("an approved cadet reaches the dashboard and the study materials", async (t) => {
  const outcome = await withFixtures(async ({ get, cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.approved);

    const dashboard = await get("/dashboard", cookie);
    const download = await get(
      "/api/study-materials/download/drill-manual-1",
      cookie
    );

    return {
      dashboard: dashboard.status,
      download: download.status,
      downloadLocation: locationOf(download),
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.dashboard, 200);
  assert.ok(
    result.download === 307 || result.download === 200,
    `the approved cadet must be able to download study material, got ${result.download}`
  );
  assert.doesNotMatch(result.downloadLocation, /\/login/);
});

test("a pending cadet is sent to the pending page and cannot download", async (t) => {
  const outcome = await withFixtures(async ({ get, cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.pending);

    const dashboard = await get("/dashboard", cookie);
    const download = await get(
      "/api/study-materials/download/drill-manual-1",
      cookie
    );
    const pendingPage = await get("/pending", cookie);

    return {
      dashboard: { status: dashboard.status, location: locationOf(dashboard) },
      download: download.status,
      pendingPage: pendingPage.status,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.dashboard.status, 307);
  assert.match(result.dashboard.location, /\/pending/);
  assert.equal(result.download, 403);
  assert.equal(result.pendingPage, 200);
});

test("a rejected cadet is denied the portal and the study materials", async (t) => {
  const outcome = await withFixtures(async ({ get, cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.rejected);

    const dashboard = await get("/dashboard", cookie);
    const download = await get(
      "/api/study-materials/download/drill-manual-1",
      cookie
    );
    const attendance = await get("/api/admin/attendance", cookie);

    return {
      dashboard: { status: dashboard.status, location: locationOf(dashboard) },
      download: download.status,
      attendance: attendance.status,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.dashboard.status, 307);
  assert.match(result.dashboard.location, /\/pending/);
  assert.equal(result.download, 403);
  assert.equal(result.attendance, 403);
});

test("an officer can use the attendance API but not the admin API", async (t) => {
  const outcome = await withFixtures(async ({ get, cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.officer);

    const adminPage = await get("/admin", cookie);
    const cadetsApi = await get("/api/admin/cadets", cookie);
    const attendanceApi = await get("/api/admin/attendance", cookie);
    const officerPage = await get("/officer", cookie);

    return {
      adminPage: { status: adminPage.status, location: locationOf(adminPage) },
      cadetsApi: cadetsApi.status,
      attendanceApi: attendanceApi.status,
      officerPage: officerPage.status,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.notEqual(result.adminPage.status, 200);
  assert.equal(result.cadetsApi, 403);
  assert.equal(result.attendanceApi, 200);
  assert.equal(result.officerPage, 200);
});

test("an approved admin reaches the admin API", async (t) => {
  const outcome = await withFixtures(async ({ get, cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.admin);

    const adminPage = await get("/admin", cookie);
    const cadetsApi = await get("/api/admin/cadets", cookie);

    return { adminPage: adminPage.status, cadetsApi: cadetsApi.status };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.adminPage, 200);
  assert.equal(outcome.result.cadetsApi, 200);
});

test("a stale admin role in the token does not grant admin access", async (t) => {
  const outcome = await withFixtures(async ({ get, cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.staleRole, "ADMIN");

    const adminPage = await get("/admin", cookie);
    const cadetsApi = await get("/api/admin/cadets", cookie);

    return {
      adminPage: { status: adminPage.status, location: locationOf(adminPage) },
      cadetsApi: cadetsApi.status,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.notEqual(result.adminPage.status, 200);
  assert.equal(result.cadetsApi, 403);
});

test("a changed database role grants access even when the token is stale", async (t) => {
  const outcome = await withFixtures(async ({ get, cookieFor, fixtures }) => {
    const cookie = await cookieFor(fixtures.changedRole, "CADET");

    const cadetsApi = await get("/api/admin/cadets", cookie);
    const adminPage = await get("/admin", cookie);

    return { cadetsApi: cadetsApi.status, adminPage: adminPage.status };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.cadetsApi, 200);
  assert.equal(outcome.result.adminPage, 200);
});

test("an admin approval takes effect immediately", async (t) => {
  const outcome = await withFixtures(
    async ({ get, patch, cookieFor, fixtures }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const cadetCookie = await cookieFor(fixtures.pending);

      const before = await get("/dashboard", cadetCookie);

      const approval = await patch(
        "/api/admin/cadets",
        { userId: fixtures.pending.id, status: "APPROVED" },
        adminCookie
      );

      const after = await get("/dashboard", cadetCookie);
      const download = await get(
        "/api/study-materials/download/drill-manual-1",
        cadetCookie
      );

      return {
        before: { status: before.status, location: locationOf(before) },
        approvalStatus: approval.status,
        after: after.status,
        download: download.status,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.before.status, 307);
  assert.match(result.before.location, /\/pending/);
  assert.equal(result.approvalStatus, 200);
  assert.equal(result.after, 200);
  assert.ok(result.download === 307 || result.download === 200);
});

test("an admin rejection takes effect immediately", async (t) => {
  const outcome = await withFixtures(
    async ({ get, patch, cookieFor, fixtures }) => {
      const adminCookie = await cookieFor(fixtures.admin);
      const cadetCookie = await cookieFor(fixtures.approved);

      const before = await get("/dashboard", cadetCookie);

      const rejection = await patch(
        "/api/admin/cadets",
        {
          userId: fixtures.approved.id,
          status: "REJECTED",
          rejectionReason: "Not on the unit roster",
        },
        adminCookie
      );

      const after = await get("/dashboard", cadetCookie);
      const download = await get(
        "/api/study-materials/download/drill-manual-1",
        cadetCookie
      );

      return {
        before: before.status,
        rejectionStatus: rejection.status,
        after: { status: after.status, location: locationOf(after) },
        download: download.status,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.before, 200);
  assert.equal(result.rejectionStatus, 200);
  assert.equal(result.after.status, 307);
  assert.match(result.after.location, /\/pending/);
  assert.equal(result.download, 403);
});

test("a cadet cannot approve or reject an account", async (t) => {
  const outcome = await withFixtures(
    async ({ patch, cookieFor, fixtures }) => {
      const cadetCookie = await cookieFor(fixtures.approved);

      const response = await patch(
        "/api/admin/cadets",
        { userId: fixtures.pending.id, status: "APPROVED" },
        cadetCookie
      );

      return { status: response.status };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 403);
});

test("the registration endpoint refuses an arbitrary email address", async (t) => {
  const outcome = await withFixtures(async ({ post }) => {
    // The application only carries the fields that the applicant owns. The
    // academic fields of the unit come from the roster.
    const body = {
      fullName: "Personal Account",
      email: "someone@gmail.com",
      bloodGroup: "O+",
      gender: "Male",
      phone: "9876543210",
    };

    const response = await post("/api/register", body);
    const payload = await response.json();

    return { status: response.status, payload };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 400);
  assert.match(outcome.result.payload.error, /college email/i);
});

test("the registration endpoint refuses the fields of the roster and of the administrators", async (t) => {
  const outcome = await withFixtures(async ({ post, emails }) => {
    const body = {
      fullName: "Sneaky Applicant",
      email: emails.registered,
      bloodGroup: "O+",
      gender: "Male",
      phone: "9876543210",
      // The fields of the roster.
      wing: "Army",
      division: "SD",
      year: "1st Year",
      branch: "Computer Science",
      prn: "PRN123",
      regiNumber: "REG123",
      // The field of an administrator.
      dob: "2006-01-01",
    };

    const response = await post("/api/register", body);
    const payload = await response.json();

    return { status: response.status, payload };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.status, 400);
  assert.match(result.payload.error, /maintained by the roster/i);

  // Every refused field is reported with its name and with its owner.
  assert.ok(Array.isArray(result.payload.fields));
  assert.ok(result.payload.fields.length >= 7);

  for (const field of result.payload.fields) {
    assert.ok(
      typeof field.field === "string" && field.field.length > 0,
      "every refused field is named"
    );
    assert.ok(
      typeof field.message === "string" && field.message.length > 0,
      "every refused field has a message"
    );
  }

  const names = result.payload.fields.map((field) => field.field);
  for (const field of [
    "wing",
    "division",
    "year",
    "branch",
    "prn",
    "regiNumber",
    "dob",
  ]) {
    assert.ok(names.includes(field), `the field ${field} is refused`);
  }
});

test("the registration endpoint never lets a client pick a role or a state", async (t) => {
  const outcome = await withFixtures(async ({ post, emails }) => {
    const body = {
      fullName: "Sneaky Applicant",
      email: emails.registered,
      bloodGroup: "O+",
      gender: "Male",
      phone: "9876543210",
      role: "ADMIN",
      approvalStatus: "APPROVED",
      id: "attacker_supplied_id",
    };

    const response = await post("/api/register", body);
    const payload = await response.json();

    return { status: response.status, payload };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 400);
  assert.match(outcome.result.payload.error, /not part of the cadet application/i);
});

test("a registered college account stays pending and cannot use the portal", async (t) => {
  const outcome = await withFixtures(
    async ({ post, get, prisma, emails, cookieFor }) => {
      const body = {
        fullName: "Registered Cadet",
        email: emails.registered,
        bloodGroup: "O+",
        gender: "Male",
        phone: "9876543210",
      };

      const response = await post("/api/register", body);

      const created = await prisma.user.findUnique({
        where: { email: emails.registered },
        select: { id: true, role: true, approvalStatus: true },
      });

      const profile = created
        ? await prisma.cadetProfile.findUnique({
            where: { userId: created.id },
            select: {
              fullName: true,
              gender: true,
              bloodGroup: true,
              phone: true,
              wing: true,
              division: true,
              year: true,
              branch: true,
              prn: true,
              regiNumber: true,
              dob: true,
            },
          })
        : null;

      const cookie = await cookieFor({
        id: created.id,
        email: emails.registered,
        role: created.role,
      });

      const dashboard = await get("/dashboard", cookie);
      const download = await get(
        "/api/study-materials/download/drill-manual-1",
        cookie
      );

      return {
        status: response.status,
        created,
        profile,
        dashboard: { status: dashboard.status, location: locationOf(dashboard) },
        download: download.status,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.status, 201);
  assert.equal(result.created.role, "CADET");
  assert.equal(result.created.approvalStatus, "PENDING");
  assert.equal(result.dashboard.status, 307);
  assert.match(result.dashboard.location, /\/pending/);
  assert.equal(result.download, 403);

  // The fields of the applicant are stored and the fields of the roster stay
  // empty. The applicant never fills them in.
  assert.ok(result.profile, "the application creates the profile of the cadet");
  assert.equal(result.profile.fullName, "Registered Cadet");
  assert.equal(result.profile.gender, "Male");
  assert.equal(result.profile.bloodGroup, "O+");
  assert.equal(result.profile.phone, "9876543210");
  assert.equal(result.profile.wing, null);
  assert.equal(result.profile.division, null);
  assert.equal(result.profile.year, null);
  assert.equal(result.profile.branch, null);
  assert.equal(result.profile.prn, null);
  assert.equal(result.profile.regiNumber, null);
  assert.equal(result.profile.dob, null);
});

test("the roster import is admin only and reports invalid rows", async (t) => {
  const outcome = await withFixtures(async ({ post, get, cookieFor, fixtures }) => {
    const adminCookie = await cookieFor(fixtures.admin);
    const officerCookie = await cookieFor(fixtures.officer);

    const csv = ["email,full name", "someone@gmail.com,Personal Account"].join(
      "\n"
    );

    const asOfficer = await post("/api/admin/roster", { csv }, officerCookie);
    const dryRun = await post(
      "/api/admin/roster",
      { csv, dryRun: true },
      adminCookie
    );
    const dryRunPayload = await dryRun.json();

    const listAsOfficer = await get("/api/admin/roster", officerCookie);

    return {
      asOfficer: asOfficer.status,
      dryRun: dryRun.status,
      dryRunPayload,
      listAsOfficer: listAsOfficer.status,
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.asOfficer, 403);
  assert.equal(result.dryRun, 200);
  assert.equal(result.dryRunPayload.valid, 0);
  assert.equal(result.dryRunPayload.invalid.length, 1);
  assert.equal(result.listAsOfficer, 403);
});

test("an imported roster row is stored and can be read back", async (t) => {
  const outcome = await withFixtures(
    async ({ post, get, prisma, cookieFor, fixtures, emails }) => {
      const adminCookie = await cookieFor(fixtures.admin);

      const csv = [
        "email,full name,prn,wing,year",
        `${emails.roster},Roster Cadet,1032200123,Army,1st Year`,
      ].join("\n");

      const imported = await post("/api/admin/roster", { csv }, adminCookie);
      const stored = await prisma.roster.findUnique({
        where: { email: emails.roster },
        select: { email: true, fullName: true, wing: true },
      });
      const list = await get("/api/admin/roster", adminCookie);
      const listPayload = await list.json();

      return {
        imported: imported.status,
        stored,
        listStatus: list.status,
        listed: listPayload.roster.some(
          (entry) => entry.email === emails.roster
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
  assert.equal(result.stored.fullName, "Roster Cadet");
  assert.equal(result.stored.wing, "Army");
  assert.equal(result.listStatus, 200);
  assert.equal(result.listed, true);
});

test("attendance can only be recorded for cadets with an approved account", async (t) => {
  const outcome = await withFixtures(
    async ({ post, cookieFor, fixtures }) => {
      const officerCookie = await cookieFor(fixtures.officer);

      const withApproved = await post(
        "/api/admin/attendance",
        {
          title: "Approved roll call",
          type: "Parade",
          date: "2026-10-29",
          marks: [{ userId: fixtures.approved.id, status: "PRESENT" }],
        },
        officerCookie
      );

      const withPending = await post(
        "/api/admin/attendance",
        {
          title: "Pending roll call",
          type: "Parade",
          date: "2026-10-29",
          marks: [{ userId: fixtures.pending.id, status: "PRESENT" }],
        },
        officerCookie
      );

      const withUnknown = await post(
        "/api/admin/attendance",
        {
          title: "Unknown roll call",
          type: "Parade",
          date: "2026-10-29",
          marks: [{ userId: "not_a_real_user", status: "PRESENT" }],
        },
        officerCookie
      );

      const withBadStatus = await post(
        "/api/admin/attendance",
        {
          title: "Bad status roll call",
          type: "Parade",
          date: "2026-10-29",
          marks: [{ userId: fixtures.approved.id, status: "WHATEVER" }],
        },
        officerCookie
      );

      return {
        approved: withApproved.status,
        pending: withPending.status,
        unknown: withUnknown.status,
        badStatus: withBadStatus.status,
      };
    }
  );

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.approved, 201);
  assert.equal(result.pending, 400);
  assert.equal(result.unknown, 400);
  assert.equal(result.badStatus, 400);
});

test("the public study material page never ships a direct file url", async (t) => {
  const outcome = await withFixtures(async ({ get, cookieFor, fixtures }) => {
    const anonymous = await get("/study-materials");
    const anonymousText = await anonymous.text();

    const cookie = await cookieFor(fixtures.approved);
    const signedIn = await get("/study-materials", cookie);
    const signedInText = await signedIn.text();

    return {
      anonymousStatus: anonymous.status,
      signedInStatus: signedIn.status,
      anonymousLeaksFileUrl: /"fileUrl"\s*:/.test(anonymousText),
      signedInLeaksFileUrl: /"fileUrl"\s*:/.test(signedInText),
      signedInLeaksStudyPath: signedInText.includes("/study/NCC_"),
      clientUsesFileUrl: readFileSync(
        join(REPO_ROOT, "src/app/study-materials/StudyMaterialsClient.tsx"),
        "utf8"
      ).includes("fileUrl"),
    };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  const result = outcome.result;
  assert.equal(result.anonymousStatus, 200);
  assert.equal(result.signedInStatus, 200);
  assert.equal(
    result.anonymousLeaksFileUrl,
    false,
    "the public page must not serialize the raw storage url"
  );
  assert.equal(
    result.signedInLeaksFileUrl,
    false,
    "the page must not serialize the raw storage url to a signed in cadet either"
  );
  assert.equal(
    result.signedInLeaksStudyPath,
    false,
    "the page must not serialize a direct file path"
  );
  assert.equal(
    result.clientUsesFileUrl,
    false,
    "the study material client must never read or render the raw file url"
  );
});
