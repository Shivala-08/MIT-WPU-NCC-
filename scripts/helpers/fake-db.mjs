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
