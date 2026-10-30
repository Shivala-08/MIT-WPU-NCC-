import assert from "node:assert/strict";
import { test } from "node:test";

import { addProfile, addUser, createFakeDb } from "./helpers/fake-db.mjs";
import {
  syncProfileFromRoster,
  updateOwnProfile,
  updateProfileAsAdmin,
} from "../src/lib/profile-service.mjs";
import {
  importRosterRows,
  setRosterActive,
} from "../src/lib/roster-service.mjs";

test("a cadet only changes the fields the cadet owns", async () => {
  const db = createFakeDb();
  const user = addUser(db);
  addProfile(db, user.id, { phone: "9876543210", wing: "Army" });

  const result = await updateOwnProfile(db, {
    userId: user.id,
    values: { phone: "9000000000", address: "Campus" },
  });

  assert.deepEqual(result.changed.sort(), ["address", "phone"]);
  assert.equal(result.profile.phone, "9000000000");
  assert.equal(result.profile.wing, "Army");
});

test("a partial update never clears a field that was not sent", async () => {
  const db = createFakeDb();
  const user = addUser(db);
  addProfile(db, user.id, {
    phone: "9876543210",
    address: "Campus",
    bloodGroup: "O+",
  });

  const result = await updateOwnProfile(db, {
    userId: user.id,
    values: { phone: "9000000000", address: undefined },
  });

  assert.deepEqual(result.changed, ["phone"]);
  assert.equal(result.profile.phone, "9000000000");
  assert.equal(result.profile.address, "Campus");
  assert.equal(result.profile.bloodGroup, "O+");
});

test("a cadet cannot write a roster controlled field through the service", async () => {
  const db = createFakeDb();
  const user = addUser(db);
  addProfile(db, user.id, { wing: "Army" });

  await assert.rejects(
    () =>
      updateOwnProfile(db, {
        userId: user.id,
        values: { wing: "Navy" },
      }),
    /not editable by the cadet/
  );

  assert.equal(db.state.profiles[0].wing, "Army");
});

test("the roster sync preserves the fields the cadet entered", async () => {
  const db = createFakeDb();
  const user = addUser(db);
  addProfile(db, user.id, {
    phone: "9876543210",
    bloodGroup: "O+",
    wing: "Army",
    year: "2nd Year",
  });

  const result = await syncProfileFromRoster(db, {
    user,
    rosterRow: {
      fullName: "Roster Name",
      prn: "PRN999",
      wing: "Navy",
      year: "3rd Year",
      branch: "Mechanical",
      division: "SD",
      regiNumber: "REG-1",
    },
  });

  assert.equal(result.profile.phone, "9876543210");
  assert.equal(result.profile.bloodGroup, "O+");
  assert.equal(result.profile.wing, "Navy");
  assert.equal(result.profile.year, "3rd Year");
  assert.equal(result.profile.prn, "PRN999");
});

test("the roster sync creates a missing profile", async () => {
  const db = createFakeDb();
  const user = addUser(db);

  const result = await syncProfileFromRoster(db, {
    user,
    rosterRow: {
      fullName: "Roster Name",
      prn: null,
      wing: "Air",
      division: null,
      year: "1st Year",
      branch: "Civil",
      regiNumber: null,
    },
  });

  assert.equal(result.created, true);
  assert.equal(result.profile.fullName, "Roster Name");
  assert.equal(result.profile.wing, "Air");
  assert.ok(!result.profile.phone);
});

test("an administrator correction is written to the audit log", async () => {
  const db = createFakeDb();
  const user = addUser(db);
  const profile = addProfile(db, user.id, { wing: "Army" });

  const result = await updateProfileAsAdmin(db, {
    userId: user.id,
    values: { wing: "Navy" },
    actorId: "admin-1",
  });

  assert.equal(result.profile.wing, "Navy");
  assert.equal(db.state.audit.length, 1);
  assert.equal(db.state.audit[0].action, "CADET_PROFILE_UPDATED");
  assert.equal(db.state.audit[0].entityId, profile.id);
  assert.equal(db.state.audit[0].userId, "admin-1");
});

test("an import reports the unmatched rows and links the matched ones", async () => {
  const db = createFakeDb();
  const user = addUser(db, {
    email: "matched@mitwpu.edu.in",
    rosterId: null,
  });
  addProfile(db, user.id, { phone: "9876543210" });

  const summary = await importRosterRows(db, {
    actorId: "admin-1",
    rows: [
      {
        email: "matched@mitwpu.edu.in",
        fullName: "Matched Cadet",
        prn: "PRN1",
        regiNumber: null,
        wing: "Army",
        division: "SD",
        year: "2nd Year",
        branch: "Computer Science",
      },
      {
        email: "unknown@mitwpu.edu.in",
        fullName: "Unknown Cadet",
        prn: null,
        regiNumber: null,
        wing: "Navy",
        division: null,
        year: "1st Year",
        branch: "Mechanical",
      },
    ],
  });

  assert.equal(summary.imported, 2);
  assert.equal(summary.created, 2);
  assert.equal(summary.matched.length, 1);
  assert.equal(summary.unmatched.length, 1);
  assert.equal(summary.unmatched[0].email, "unknown@mitwpu.edu.in");
  assert.equal(user.rosterId, db.state.roster[0].id);
  assert.equal(db.state.profiles[0].phone, "9876543210");
  assert.equal(db.state.profiles[0].wing, "Army");
});

test("an import never changes the approval state of an account", async () => {
  const db = createFakeDb();
  const rejected = addUser(db, {
    email: "rejected@mitwpu.edu.in",
    approvalStatus: "REJECTED",
  });

  await importRosterRows(db, {
    actorId: "admin-1",
    rows: [
      {
        email: "rejected@mitwpu.edu.in",
        fullName: "Rejected Cadet",
        prn: null,
        regiNumber: null,
        wing: "Army",
        division: null,
        year: "1st Year",
        branch: "Computer Science",
      },
    ],
  });

  assert.equal(rejected.approvalStatus, "REJECTED");
  assert.equal(rejected.role, "CADET");
});

test("a deactivated roster row stays deactivated after a later import", async () => {
  const db = createFakeDb();
  const user = addUser(db, { email: "cadet@mitwpu.edu.in" });
  addProfile(db, user.id);

  const row = {
    email: "cadet@mitwpu.edu.in",
    fullName: "Cadet",
    prn: null,
    regiNumber: null,
    wing: "Army",
    division: null,
    year: "1st Year",
    branch: "Computer Science",
  };

  await importRosterRows(db, { rows: [row] });
  const rosterRow = db.state.roster[0];

  await setRosterActive(db, {
    rosterId: rosterRow.id,
    active: false,
    actorId: "admin-1",
  });

  assert.equal(rosterRow.active, false);
  assert.equal(db.state.users.length, 1);
  assert.equal(user.approvalStatus, "APPROVED");
  assert.equal(user.role, "CADET");

  const summary = await importRosterRows(db, { rows: [row] });

  assert.equal(db.state.roster[0].active, false);
  assert.equal(summary.attention.length, 1);
  assert.equal(db.state.users.length, 1);
});
