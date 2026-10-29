import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { classifyDatabaseTarget } from "../src/lib/prisma-target.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const BASE_URL = process.env.NCC_TEST_BASE_URL ?? "http://localhost:3001";

function readEnvFile(path) {
  const values = {};
  if (!existsSync(path)) {
    return values;
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (match) {
      values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

function loadContext() {
  const env = {
    ...readEnvFile(join(REPO_ROOT, ".env")),
    ...readEnvFile(join(REPO_ROOT, ".env.local")),
  };

  const target = classifyDatabaseTarget(env.DATABASE_URL, { env });
  const secret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;

  if (target.kind !== "local") {
    return { skip: "the configured DATABASE_URL is not a local development database" };
  }

  if (!secret) {
    return { skip: "no session secret is configured locally" };
  }

  return { skip: null, env, secret };
}

async function serverIsReachable() {
  try {
    const response = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
    return response.ok || response.status === 307;
  } catch {
    return false;
  }
}

async function withFixtures(run) {
  const context = loadContext();

  if (context.skip) {
    return { skip: context.skip };
  }

  if (!(await serverIsReachable())) {
    return { skip: `the development server is not reachable at ${BASE_URL}` };
  }

  const { PrismaClient } = await import("@prisma/client");
  const { encode } = await import("next-auth/jwt");

  const prisma = new PrismaClient({
    datasources: { db: { url: context.env.DATABASE_URL } },
  });

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

    const cookieFor = async (user, roleOverride) => {
      const token = await encode({
        token: {
          id: user.id,
          sub: user.id,
          email: user.email,
          name: `Fixture ${user.email}`,
          role: roleOverride ?? user.role,
        },
        secret: context.secret,
        salt: "authjs.session-token",
      });
      return `authjs.session-token=${token}`;
    };

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
    await prisma.attendanceSession.deleteMany({
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
    const body = {
      fullName: "Personal Account",
      email: "someone@gmail.com",
      wing: "Army",
      division: "SD",
      year: "1st Year",
      branch: "Computer Science",
      dob: "2006-01-01",
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

test("the registration endpoint never lets a client pick a role or a state", async (t) => {
  const outcome = await withFixtures(async ({ post, emails }) => {
    const body = {
      fullName: "Sneaky Applicant",
      email: emails.registered,
      wing: "Army",
      division: "SD",
      year: "1st Year",
      branch: "Computer Science",
      dob: "2006-01-01",
      bloodGroup: "O+",
      gender: "Male",
      phone: "9876543210",
      role: "ADMIN",
      approvalStatus: "APPROVED",
      id: "attacker_supplied_id",
    };

    const response = await post("/api/register", body);

    return { status: response.status };
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }

  assert.equal(outcome.result.status, 400);
});

test("a registered college account stays pending and cannot use the portal", async (t) => {
  const outcome = await withFixtures(
    async ({ post, get, prisma, emails, cookieFor }) => {
      const body = {
        fullName: "Registered Cadet",
        email: emails.registered,
        wing: "Army",
        division: "SD",
        year: "1st Year",
        branch: "Computer Science",
        dob: "2006-01-01",
        bloodGroup: "O+",
        gender: "Male",
        phone: "9876543210",
      };

      const response = await post("/api/register", body);

      const created = await prisma.user.findUnique({
        where: { email: emails.registered },
        select: { id: true, role: true, approvalStatus: true },
      });

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
