/**
 * The shared setup of the suites that run against a real PostgreSQL.
 *
 * The suites of this helper do not use a test double. They use the local
 * development database, so the transactions, the foreign keys and the unique
 * constraints behave exactly like they behave in the deployment.
 *
 * The rule of the suites is the rule of `db-suite.mjs`:
 *
 *   * the configured database is not a local development database -> the
 *     suite skips, because there is nothing to test against;
 *   * the configured database is the local development database and
 *     something is missing -> the suite fails.
 *
 * The failure injection of this helper uses a proxy around the real client.
 * The proxy only replaces one operation, everything else is the real
 * database, so a rolled back transaction is a real rollback.
 */

import {
  createPrismaClient,
  loadSuiteContext,
  requireColumn,
  requireDatabase,
} from "./db-suite.mjs";

export { createPrismaClient, loadSuiteContext, requireColumn, requireDatabase };

/**
 * Copies the environment of the repository into the process.
 *
 * The modules of the application read their configuration from
 * `process.env` when they are loaded. The suite loads the route modules
 * dynamically, so the environment has to be in place before the import. A
 * value that is already set in the process is never overwritten.
 *
 * @param {Record<string, string>} env
 * @returns {void}
 */
export function applyEnvironment(env) {
  for (const [key, value] of Object.entries(env ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Opens the local development database and proves that it answers.
 *
 * @param {{ requireSecret?: boolean }} [options]
 * @returns {Promise<{ skip: string | null, prisma: any, env: Record<string, string> }>}
 */
export async function openIntegrationDatabase(options = {}) {
  const context = loadSuiteContext(options);

  if (context.skip) {
    return { skip: context.skip, prisma: null, env: context.env };
  }

  applyEnvironment(context.env);

  const prisma = await createPrismaClient(context.env);

  try {
    await requireDatabase(prisma);
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    throw error;
  }

  return { skip: null, prisma, env: context.env };
}

/**
 * Reports whether the database has the column of the approval decision.
 *
 * The column is added by the migration
 * `20261105000000_approval_decision_source`. The application works with and
 * without the column, so the suites assert the contract of the window they
 * run in and report which window it was.
 *
 * @param {any} prisma
 * @returns {Promise<boolean>}
 */
export async function decisionSourceColumnPresent(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT 1 AS present
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'User'
      AND column_name = 'approvalDecisionSource'
    LIMIT 1
  `;

  return rows.length > 0;
}

/**
 * Builds a proxy of a database client with one replaced operation.
 *
 * The transaction client is wrapped as well, so a failure inside a
 * transaction really rolls the transaction back.
 *
 * @param {any} client
 * @param {Record<string, (real: any) => any>} overrides
 * @returns {any}
 */
function wrapClient(client, overrides) {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, target);

      // The transaction client of Prisma has no `$transaction` of its own.
      // Only the client that really supports it is wrapped.
      if (property === "$transaction" && typeof value === "function") {
        return (work, ...rest) =>
          value.call(
            target,
            async (tx) => work(wrapClient(tx, overrides)),
            ...rest
          );
      }

      const override = overrides[property];

      if (override) {
        return override(value);
      }

      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * A database whose audit trail refuses every write.
 *
 * @param {any} prisma
 * @returns {any}
 */
export function withFailingAudit(prisma) {
  return wrapClient(prisma, {
    auditLog: () => ({
      async create() {
        const error = new Error("The audit trail refused the write");
        error.code = "AUDIT_INSERT_FAILED";
        throw error;
      },
    }),
  });
}

/**
 * A database whose account update refuses every write.
 *
 * @param {any} prisma
 * @returns {any}
 */
export function withFailingAccountUpdate(prisma) {
  return wrapClient(prisma, {
    user: (realUser) =>
      new Proxy(realUser, {
        get(target, property) {
          if (property === "update" || property === "updateMany") {
            return async () => {
              const error = new Error("The account update failed");
              error.code = "ACCOUNT_UPDATE_FAILED";
              throw error;
            };
          }

          const value = Reflect.get(target, property, target);

          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
  });
}

/**
 * A database without a writable audit trail.
 *
 * @param {any} prisma
 * @returns {any}
 */
export function withoutAuditTrail(prisma) {
  return wrapClient(prisma, {
    auditLog: () => undefined,
  });
}

/**
 * A database whose account creation refuses every write.
 *
 * @param {any} prisma
 * @returns {any}
 */
export function withFailingAccountCreate(prisma) {
  return wrapClient(prisma, {
    user: (realUser) =>
      new Proxy(realUser, {
        get(target, property) {
          if (property === "create" || property === "createMany") {
            return async () => {
              const error = new Error("The account creation failed");
              error.code = "ACCOUNT_CREATE_FAILED";
              throw error;
            };
          }

          const value = Reflect.get(target, property, target);

          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
  });
}

/**
 * A database whose profile update refuses every write.
 *
 * @param {any} prisma
 * @returns {any}
 */
export function withFailingProfileUpdate(prisma) {
  return wrapClient(prisma, {
    cadetProfile: (realProfile) =>
      new Proxy(realProfile, {
        get(target, property) {
          if (property === "update" || property === "updateMany") {
            return async () => {
              const error = new Error("The profile update failed");
              error.code = "PROFILE_UPDATE_FAILED";
              throw error;
            };
          }

          const value = Reflect.get(target, property, target);

          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
  });
}

/**
 * A prefix that no account of the unit uses.
 *
 * @param {string} name
 * @returns {string}
 */
export function fixturePrefix(name) {
  return `ncc-${name}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/**
 * Creates an account of the unit.
 *
 * @param {any} prisma
 * @param {{
 *   email: string,
 *   name?: string,
 *   role?: string,
 *   approvalStatus?: string,
 *   approvedById?: string | null,
 *   rosterId?: string | null,
 *   approvalDecisionSource?: string,
 * }} input
 * @returns {Promise<any>}
 */
export async function createAccount(prisma, input) {
  const data = {
    name: input.name ?? `Fixture ${input.email}`,
    email: input.email,
    password: null,
    role: input.role ?? "CADET",
    approvalStatus: input.approvalStatus ?? "PENDING",
    approvedAt:
      input.approvalStatus === "APPROVED" ? new Date() : null,
    approvedById: input.approvedById ?? null,
    rosterId: input.rosterId ?? null,
  };

  // The column of the approval decision only exists after the migration. The
  // value is only written when the database has it.
  if (input.approvalDecisionSource) {
    const rows = await prisma.$queryRaw`
      SELECT 1 AS present
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'User'
        AND column_name = 'approvalDecisionSource'
      LIMIT 1
    `;

    if (rows.length > 0) {
      data.approvalDecisionSource = input.approvalDecisionSource;
    }
  }

  return prisma.user.create({
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      approvalStatus: true,
      approvedById: true,
      rosterId: true,
      deactivatedAt: true,
    },
  });
}

/**
 * Creates a roster row of the unit.
 *
 * @param {any} prisma
 * @param {{
 *   email: string,
 *   fullName?: string,
 *   active?: boolean,
 *   wing?: string,
 *   division?: string,
 *   year?: string,
 *   branch?: string,
 *   prn?: string,
 *   regiNumber?: string,
 * }} input
 * @returns {Promise<any>}
 */
export async function createRosterRow(prisma, input) {
  return prisma.roster.create({
    data: {
      email: input.email,
      fullName: input.fullName ?? `Cadet ${input.email}`,
      active: input.active ?? true,
      wing: input.wing ?? "Army",
      division: input.division ?? "SD",
      year: input.year ?? "1st Year",
      branch: input.branch ?? "Computer Science",
      prn: input.prn ?? null,
      regiNumber: input.regiNumber ?? null,
    },
    select: { id: true, email: true, active: true },
  });
}

/**
 * Creates the profile of a cadet.
 *
 * @param {any} prisma
 * @param {string} userId
 * @param {Record<string, unknown>} [fields]
 * @returns {Promise<any>}
 */
export async function createProfile(prisma, userId, fields = {}) {
  return prisma.cadetProfile.create({
    data: {
      userId,
      fullName: fields.fullName ?? "Fixture Cadet",
      status: fields.status ?? "PENDING",
      phone: fields.phone ?? null,
      address: fields.address ?? null,
      parentContact: fields.parentContact ?? null,
      emergencyContact: fields.emergencyContact ?? null,
      bloodGroup: fields.bloodGroup ?? null,
      gender: fields.gender ?? null,
      height: fields.height ?? null,
      weight: fields.weight ?? null,
      dob: fields.dob ?? null,
      prn: fields.prn ?? null,
      regiNumber: fields.regiNumber ?? null,
      wing: fields.wing ?? null,
      division: fields.division ?? null,
      year: fields.year ?? null,
      branch: fields.branch ?? null,
    },
    select: { id: true, userId: true },
  });
}

/**
 * Removes every row of the fixtures of one run.
 *
 * The order follows the foreign keys of the schema: the records that point
 * at an account go first, the profile of a cadet goes before the account and
 * the account goes before the roster row.
 *
 * @param {any} prisma
 * @param {string} prefix
 * @returns {Promise<void>}
 */
export async function removeFixtures(prisma, prefix) {
  const accounts = await prisma.user.findMany({
    where: { email: { contains: prefix } },
    select: { id: true },
  });

  const ids = accounts.map((account) => account.id);

  // The rows of the roster of the run are collected as well. An audit event
  // of a roster row points at the row and not at an account, so it is
  // removed by the identifier of the row.
  const rosterRows = await prisma.roster.findMany({
    where: { email: { contains: prefix } },
    select: { id: true },
  });

  const rosterIds = rosterRows.map((row) => row.id);

  const profiles = await prisma.cadetProfile.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });

  const profileIds = profiles.map((profile) => profile.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { userId: { in: ids } },
        { entityId: { in: [...ids, ...rosterIds, ...profileIds] } },
        { action: { startsWith: `TEST_${prefix}` } },
      ],
    },
  });

  await prisma.attendance.deleteMany({ where: { userId: { in: ids } } });

  await prisma.leaveRequest.deleteMany({ where: { userId: { in: ids } } });

  const sessions = await prisma.attendanceSession.findMany({
    where: { createdById: { in: ids } },
    select: { id: true },
  });

  const sessionIds = sessions.map((session) => session.id);

  if (sessionIds.length > 0) {
    await prisma.attendanceQrToken.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await prisma.attendanceManualCode.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { id: { in: sessionIds } },
    });
  }

  await prisma.cadetProfile.deleteMany({ where: { userId: { in: ids } } });

  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  await prisma.roster.deleteMany({ where: { email: { contains: prefix } } });
}

/**
 * Reads the audit events of one entity.
 *
 * @param {any} prisma
 * @param {{ action?: string, entity?: string, entityId?: string | null }} filter
 * @returns {Promise<any[]>}
 */
export async function readAuditEvents(prisma, filter = {}) {
  const entityId = filter.entityId;

  const where = {
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.entity ? { entity: filter.entity } : {}),
    ...(entityId === undefined || entityId === null
      ? {}
      : Array.isArray(entityId)
        ? { entityId: { in: entityId } }
        : { entityId }),
  };

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      action: true,
      entity: true,
      entityId: true,
      oldData: true,
      newData: true,
    },
  });
}
