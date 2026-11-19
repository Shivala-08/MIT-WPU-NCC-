/**
 * A tiny in-memory database double for the service level tests.
 *
 * It only implements the operations that the profile and roster services use,
 * so a test can assert the rules without a database connection.
 */

export function createFakeDb() {
  const state = {
    users: [],
    profiles: [],
    roster: [],
    audit: [],
  };

  let sequence = 0;
  const nextId = (prefix) => `${prefix}-${(sequence += 1)}`;

  return {
    state,

    user: {
      async findUnique({ where }) {
        if (where.email) {
          return state.users.find((user) => user.email === where.email) ?? null;
        }

        return state.users.find((user) => user.id === where.id) ?? null;
      },
      async findMany({ where } = {}) {
        return state.users.filter((user) => matchesWhere(user, where));
      },
      async count({ where } = {}) {
        return state.users.filter((user) => matchesWhere(user, where)).length;
      },
      async update({ where, data }) {
        const user = state.users.find((entry) => entry.id === where.id);

        if (!user) {
          throw new Error("User not found");
        }

        Object.assign(user, data);
        return user;
      },
      async create({ data }) {
        const user = { id: nextId("user"), ...data };
        state.users.push(user);
        return user;
      },
    },

    roster: {
      async findUnique({ where }) {
        if (where.email) {
          return state.roster.find((row) => row.email === where.email) ?? null;
        }

        return state.roster.find((row) => row.id === where.id) ?? null;
      },
      async findFirst() {
        return null;
      },
      async create({ data }) {
        const row = {
          id: nextId("roster"),
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.roster.push(row);
        return row;
      },
      async update({ where, data }) {
        const row = state.roster.find((entry) => entry.id === where.id);

        if (!row) {
          throw new Error("Roster row not found");
        }

        Object.assign(row, data);
        return row;
      },
    },

    cadetProfile: {
      async findUnique({ where }) {
        return state.profiles.find((row) => row.userId === where.userId) ?? null;
      },
      async create({ data }) {
        const profile = {
          id: nextId("profile"),
          status: "PENDING",
          photoUrl: null,
          photoThumbnailUrl: null,
          ...data,
        };
        state.profiles.push(profile);
        return profile;
      },
      async update({ where, data }) {
        const profile = state.profiles.find((row) => row.userId === where.userId);

        if (!profile) {
          throw new Error("Cadet profile not found");
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
        state.audit.push(data);
        return data;
      },
      async findMany() {
        return [];
      },
    },

    // The transaction of the fixture database is a single connection. It
    // exercises the same code path as a real transaction, but it cannot roll
    // back. The atomicity of the services is tested against PostgreSQL.
    async $transaction(work) {
      return work(this);
    },
  };
}

export function addUser(db, overrides = {}) {
  const user = {
    id: `user-${db.state.users.length + 1}`,
    name: "Fixture Cadet",
    email: `cadet-${db.state.users.length + 1}@mitwpu.edu.in`,
    role: "CADET",
    approvalStatus: "APPROVED",
    rosterId: null,
    deactivatedAt: null,
    deactivatedById: null,
    deactivationReason: null,
    ...overrides,
  };

  db.state.users.push(user);
  return user;
}

export function addProfile(db, userId, overrides = {}) {
  const profile = {
    id: `profile-${db.state.profiles.length + 1}`,
    userId,
    fullName: "Fixture Cadet",
    prn: null,
    regiNumber: null,
    wing: null,
    division: null,
    year: null,
    branch: null,
    dob: null,
    bloodGroup: null,
    gender: null,
    phone: null,
    address: null,
    parentContact: null,
    height: null,
    weight: null,
    photoUrl: null,
    photoThumbnailUrl: null,
    emergencyContact: null,
    status: "APPROVED",
    ...overrides,
  };

  db.state.profiles.push(profile);
  return profile;
}

function matchesCondition(value, condition) {
  if (condition === null) {
    return value === null || value === undefined;
  }

  if (typeof condition === "object" && !(condition instanceof Date)) {
    // A filter of a relation. The relation is either there or it is not, and
    // the condition of the relation is evaluated against the related row.
    if ("is" in condition || "isNot" in condition) {
      const relation = value ?? null;

      if ("is" in condition) {
        if (condition.is === null) {
          return relation === null;
        }

        if (relation === null) {
          return false;
        }

        return matchesWhere(relation, condition.is);
      }

      if (condition.isNot === null) {
        return relation !== null;
      }

      if (relation === null) {
        return true;
      }

      return !matchesWhere(relation, condition.isNot);
    }

    if (Array.isArray(condition.in)) {
      return condition.in.includes(value);
    }

    if (condition.notIn) {
      return !condition.notIn.includes(value);
    }

    if (condition.gte !== undefined) {
      const left = value instanceof Date ? value : new Date(value);
      const right =
        condition.gte instanceof Date ? condition.gte : new Date(condition.gte);

      if (Number.isNaN(left.getTime()) || left < right) {
        return false;
      }
    }

    if (condition.lte !== undefined) {
      const left = value instanceof Date ? value : new Date(value);
      const right =
        condition.lte instanceof Date ? condition.lte : new Date(condition.lte);

      if (Number.isNaN(left.getTime()) || left > right) {
        return false;
      }
    }

    if (condition.gt !== undefined) {
      const left = value instanceof Date ? value : new Date(value);
      const right =
        condition.gt instanceof Date ? condition.gt : new Date(condition.gt);

      if (Number.isNaN(left.getTime()) || left <= right) {
        return false;
      }
    }

    if (condition.lt !== undefined) {
      const left = value instanceof Date ? value : new Date(value);
      const right =
        condition.lt instanceof Date ? condition.lt : new Date(condition.lt);

      if (Number.isNaN(left.getTime()) || left >= right) {
        return false;
      }
    }

    return true;
  }

  return value === condition;
}

export function matchesWhere(row, where) {
  if (!where) {
    return true;
  }

  for (const [key, condition] of Object.entries(where)) {
    if (key === "AND") {
      if (!condition.every((entry) => matchesWhere(row, entry))) {
        return false;
      }

      continue;
    }

    if (key === "OR") {
      if (!condition.some((entry) => matchesWhere(row, entry))) {
        return false;
      }

      continue;
    }

    if (key === "NOT") {
      // The negated condition is either a list of conditions or a single
      // condition. Prisma accepts both.
      const entries = Array.isArray(condition) ? condition : [condition];

      if (entries.some((entry) => matchesWhere(row, entry))) {
        return false;
      }

      continue;
    }

    if (!matchesCondition(row[key], condition)) {
      return false;
    }
  }

  return true;
}

function applyOrder(rows, orderBy) {
  if (!orderBy) {
    return rows;
  }

  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];

  return [...rows].sort((left, right) => {
    for (const entry of entries) {
      for (const [field, direction] of Object.entries(entry)) {
        const a = left[field];
        const b = right[field];

        if (a === b) {
          continue;
        }

        const order = a > b ? 1 : -1;

        return direction === "desc" ? -order : order;
      }
    }

    return 0;
  });
}

function applyRange(rows, { take, skip }) {
  const start = skip ?? 0;

  if (take === undefined) {
    return rows.slice(start);
  }

  return rows.slice(start, start + take);
}

/**
 * An in-memory database double for the attendance, QR and leave services.
 *
 * It implements the operations that the phase 3 services use so that the
 * rules can be asserted without a database connection.
 */
export function createFakeAttendanceDb() {
  const state = {
    users: [],
    profiles: [],
    sessions: [],
    attendances: [],
    tokens: [],
    manualCodes: [],
    leaves: [],
    policies: [],
    audit: [],
  };

  let sequence = 0;
  const nextId = (prefix) => `${prefix}-${(sequence += 1)}`;

  const userById = (id) => state.users.find((user) => user.id === id) ?? null;
  const profileByUser = (userId) =>
    state.profiles.find((profile) => profile.userId === userId) ?? null;

  const withRelations = (session) => ({
    ...session,
    attendances: state.attendances
      .filter((record) => record.sessionId === session.id)
      .map((record) => ({
        ...record,
        user: userById(record.userId),
        markedBy: record.markedById ? userById(record.markedById) : null,
      })),
    createdBy: session.createdById ? userById(session.createdById) : null,
  });

  return {
    state,

    user: {
      async findMany({ where, select } = {}) {
        return state.users
          .filter((user) => matchesWhere(user, where))
          .map((user) => {
            const profile = profileByUser(user.id);

            if (!select) {
              return { ...user, cadetProfile: profile };
            }

            const picked = {};

            for (const [field, enabled] of Object.entries(select)) {
              if (!enabled) {
                continue;
              }

              if (field === "cadetProfile") {
                picked.cadetProfile = profile;
                continue;
              }

              picked[field] = user[field];
            }

            return picked;
          });
      },

      async findUnique({ where }) {
        return userById(where.id) ?? null;
      },

      async count({ where } = {}) {
        return state.users.filter((user) => matchesWhere(user, where)).length;
      },
    },

    attendanceSession: {
      async findMany({ where, orderBy, take, skip } = {}) {
        return applyRange(
          applyOrder(
            state.sessions.filter((session) => matchesWhere(session, where)),
            orderBy
          ),
          { take, skip }
        );
      },

      async findUnique({ where }) {
        const session = state.sessions.find((entry) => entry.id === where.id);

        return session ? withRelations(session) : null;
      },

      async create({ data }) {
        const session = {
          id: nextId("session"),
          status: "DRAFT",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };

        state.sessions.push(session);

        return session;
      },

      async update({ where, data }) {
        const session = state.sessions.find((entry) => entry.id === where.id);

        if (!session) {
          throw new Error("Session not found");
        }

        Object.assign(session, data, { updatedAt: new Date() });

        return session;
      },

      async count({ where } = {}) {
        return state.sessions.filter((session) =>
          matchesWhere(session, where)
        ).length;
      },
    },

    attendance: {
      async findMany({ where, orderBy, take, skip } = {}) {
        return applyRange(
          applyOrder(
            state.attendances
              .filter((record) => matchesWhere(record, where))
              .map((record) => ({ ...record })),
            orderBy
          ),
          { take, skip }
        );
      },

      async findUnique({ where }) {
        if (where.userId_sessionId) {
          const { userId, sessionId } = where.userId_sessionId;
          const record = state.attendances.find(
            (entry) => entry.userId === userId && entry.sessionId === sessionId
          );

          return record ? { ...record } : null;
        }

        const record = state.attendances.find((entry) => entry.id === where.id);

        return record ? { ...record } : null;
      },

      async create({ data }) {
        const duplicate = state.attendances.find(
          (record) =>
            record.userId === data.userId && record.sessionId === data.sessionId
        );

        if (duplicate) {
          const error = new Error("Unique constraint failed");
          error.code = "P2002";
          throw error;
        }

        const record = {
          id: nextId("attendance"),
          method: "MANUAL",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };

        state.attendances.push(record);

        return record;
      },

      async update({ where, data }) {
        const record = state.attendances.find((entry) => entry.id === where.id);

        if (!record) {
          throw new Error("Attendance record not found");
        }

        Object.assign(record, data, { updatedAt: new Date() });

        return record;
      },

      async count({ where } = {}) {
        return state.attendances.filter((record) =>
          matchesWhere(record, where)
        ).length;
      },
    },

    attendanceQrToken: {
      async findMany({ where } = {}) {
        return state.tokens.filter((token) => matchesWhere(token, where));
      },

      async findUnique({ where }) {
        if (where.tokenHash) {
          const token = state.tokens.find(
            (entry) => entry.tokenHash === where.tokenHash
          );

          if (!token) {
            return null;
          }

          const session = state.sessions.find(
            (entry) => entry.id === token.sessionId
          );

          return { ...token, session: session ?? null };
        }

        return state.tokens.find((entry) => entry.id === where.id) ?? null;
      },

      async findFirst({ where, orderBy } = {}) {
        const rows = applyOrder(
          state.tokens.filter((token) => matchesWhere(token, where)),
          orderBy
        );

        return rows[0] ?? null;
      },

      async create({ data }) {
        const token = {
          id: nextId("token"),
          createdAt: new Date(),
          revokedAt: null,
          ...data,
        };

        state.tokens.push(token);

        return token;
      },

      async updateMany({ where, data }) {
        let count = 0;

        for (const token of state.tokens) {
          if (matchesWhere(token, where)) {
            Object.assign(token, data);
            count += 1;
          }
        }

        return { count };
      },
    },

    attendanceManualCode: {
      async findMany({ where } = {}) {
        return state.manualCodes.filter((code) => matchesWhere(code, where));
      },

      async findUnique({ where }) {
        if (where.codeHash) {
          const code = state.manualCodes.find(
            (entry) => entry.codeHash === where.codeHash
          );

          if (!code) {
            return null;
          }

          const session = state.sessions.find(
            (entry) => entry.id === code.sessionId
          );

          return { ...code, session: session ?? null };
        }

        return state.manualCodes.find((entry) => entry.id === where.id) ?? null;
      },

      async findFirst({ where, orderBy } = {}) {
        const rows = applyOrder(
          state.manualCodes.filter((code) => matchesWhere(code, where)),
          orderBy
        );

        return rows[0] ?? null;
      },

      async create({ data }) {
        const code = {
          id: nextId("manual-code"),
          createdAt: new Date(),
          revokedAt: null,
          ...data,
        };

        state.manualCodes.push(code);

        return code;
      },

      async updateMany({ where, data }) {
        let count = 0;

        for (const code of state.manualCodes) {
          if (matchesWhere(code, where)) {
            Object.assign(code, data);
            count += 1;
          }
        }

        return { count };
      },
    },

    leaveRequest: {
      async findMany({ where, orderBy, take, skip } = {}) {
        return applyRange(
          applyOrder(
            state.leaves.filter((leave) => matchesWhere(leave, where)),
            orderBy
          ),
          { take, skip }
        );
      },

      async findFirst({ where } = {}) {
        return state.leaves.find((leave) => matchesWhere(leave, where)) ?? null;
      },

      async findUnique({ where }) {
        const leave = state.leaves.find((entry) => entry.id === where.id);

        if (!leave) {
          return null;
        }

        const user = userById(leave.userId);

        return {
          ...leave,
          user: user
            ? { ...user, cadetProfile: profileByUser(user.id) }
            : null,
          reviewedBy: leave.reviewedById ? userById(leave.reviewedById) : null,
        };
      },

      async create({ data }) {
        const leave = {
          id: nextId("leave"),
          status: "PENDING",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };

        state.leaves.push(leave);

        return leave;
      },

      async update({ where, data }) {
        const leave = state.leaves.find((entry) => entry.id === where.id);

        if (!leave) {
          throw new Error("Leave request not found");
        }

        Object.assign(leave, data, { updatedAt: new Date() });

        return leave;
      },

      async count({ where } = {}) {
        return state.leaves.filter((leave) => matchesWhere(leave, where)).length;
      },
    },

    attendancePolicy: {
      async findUnique({ where }) {
        return state.policies.find((policy) => policy.id === where.id) ?? null;
      },

      async upsert({ where, update, create }) {
        const existing = state.policies.find((policy) => policy.id === where.id);

        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });

          return existing;
        }

        const policy = {
          id: where.id,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };

        state.policies.push(policy);

        return policy;
      },
    },

    auditLog: {
      async create({ data }) {
        state.audit.push(data);

        return data;
      },

      async findMany({ where } = {}) {
        return state.audit.filter((entry) => matchesWhere(entry, where));
      },
    },

    async $transaction(work) {
      return work(this);
    },
  };
}

export function addAttendanceUser(db, overrides = {}) {
  const user = {
    id: `attendance-user-${db.state.users.length + 1}`,
    name: "Fixture Cadet",
    email: `cadet-${db.state.users.length + 1}@mitwpu.edu.in`,
    role: "CADET",
    approvalStatus: "APPROVED",
    deactivatedAt: null,
    // The roster row of the cadet. A cadet without a row is not blocked by
    // the roster, a cadet with an inactive row is not on the roll any more.
    roster: null,
    ...overrides,
  };

  db.state.users.push(user);

  return user;
}
