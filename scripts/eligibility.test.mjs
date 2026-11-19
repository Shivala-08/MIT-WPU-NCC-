import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APPROVAL_STATUSES,
  decideRosterApproval,
  effectiveDecisionSource,
  isAllowedCollegeEmail,
  isApprovalStatus,
  isDisallowedPersonalDomain,
  isRosterEntryActive,
  isRosterMatch,
  mapLegacyProfileStatus,
  normalizeApprovalDecisionSource,
  normalizeApprovalStatus,
  normalizeEmail,
  parseAllowedEmailDomains,
  reconcileApprovalStatus,
} from "../src/lib/eligibility.mjs";
import {
  ROSTER_MAX_ROWS,
  parseAndValidateRosterCsv,
  parseRosterCsv,
  validateRosterRows,
} from "../src/lib/roster.mjs";

const DOMAINS = ["mitwpu.edu.in"];

test("only exact college domains are allowed", () => {
  assert.equal(isAllowedCollegeEmail("cadet@mitwpu.edu.in", DOMAINS), true);
  assert.equal(isAllowedCollegeEmail("Cadet@MITWPU.EDU.IN", DOMAINS), true);
  assert.equal(isAllowedCollegeEmail("cadet@mitwpu.edu.in ", DOMAINS), true);

  assert.equal(isAllowedCollegeEmail("cadet@gmail.com", DOMAINS), false);
  assert.equal(isAllowedCollegeEmail("cadet@mitwpu.edu.in.evil.com", DOMAINS), false);
  assert.equal(isAllowedCollegeEmail("cadet@evil-mitwpu.edu.in", DOMAINS), false);
  assert.equal(isAllowedCollegeEmail("cadet@mitwpu.edu.in.other.org", DOMAINS), false);
  assert.equal(isAllowedCollegeEmail("cadet@sub.mitwpu.edu.in", DOMAINS), false);
  assert.equal(isAllowedCollegeEmail("not-an-email", DOMAINS), false);
  assert.equal(isAllowedCollegeEmail("", DOMAINS), false);
  assert.equal(isAllowedCollegeEmail(undefined, DOMAINS), false);
});

test("personal mail domains are recognised as disallowed", () => {
  assert.equal(isDisallowedPersonalDomain("student@gmail.com"), true);
  assert.equal(isDisallowedPersonalDomain("student@googlemail.com"), true);
  assert.equal(isDisallowedPersonalDomain("student@mitwpu.edu.in"), false);
});

test("the allowed domain list is parsed from the environment value", () => {
  assert.deepEqual(parseAllowedEmailDomains(undefined), ["mitwpu.edu.in"]);
  assert.deepEqual(parseAllowedEmailDomains(""), ["mitwpu.edu.in"]);
  assert.deepEqual(parseAllowedEmailDomains("@MITWPU.EDU.IN"), ["mitwpu.edu.in"]);
  assert.deepEqual(
    parseAllowedEmailDomains("mitwpu.edu.in, college.example "),
    ["mitwpu.edu.in", "college.example"]
  );
});

test("email addresses are normalised before they are compared", () => {
  assert.equal(normalizeEmail("  Cadet@MITWPU.edu.in "), "cadet@mitwpu.edu.in");
});

test("approval states are limited to the three documented values", () => {
  assert.deepEqual([...APPROVAL_STATUSES], ["PENDING", "APPROVED", "REJECTED"]);
  assert.equal(isApprovalStatus("APPROVED"), true);
  assert.equal(isApprovalStatus("approved"), true);
  assert.equal(isApprovalStatus("BLOCKED"), false);
  assert.equal(isApprovalStatus(null), false);
});

test("legacy profile states are mapped to the authoritative states", () => {
  assert.equal(mapLegacyProfileStatus("APPROVED"), "APPROVED");
  assert.equal(mapLegacyProfileStatus("REJECTED"), "REJECTED");
  assert.equal(mapLegacyProfileStatus("SUBMITTED"), "PENDING");
  assert.equal(mapLegacyProfileStatus("UNDER REVIEW"), "PENDING");
  assert.equal(mapLegacyProfileStatus("INVITED"), "PENDING");
  assert.equal(mapLegacyProfileStatus(undefined), "PENDING");
});

test("an existing account keeps its state unless the roster approves it", () => {
  assert.equal(
    reconcileApprovalStatus({
      currentStatus: "REJECTED",
      rosterMatch: true,
    }),
    "REJECTED"
  );
  assert.equal(
    reconcileApprovalStatus({
      currentStatus: "PENDING",
      rosterMatch: true,
    }),
    "APPROVED"
  );
  assert.equal(
    reconcileApprovalStatus({
      currentStatus: "PENDING",
      rosterMatch: false,
    }),
    "PENDING"
  );
  assert.equal(
    reconcileApprovalStatus({
      currentStatus: null,
      role: "ADMIN",
      rosterMatch: false,
    }),
    "APPROVED"
  );
});

test("the roster decision never overrides a rejection", () => {
  assert.deepEqual(
    decideRosterApproval({
      approvalStatus: "REJECTED",
      rosterEntry: { active: true },
    }),
    { approvalStatus: "REJECTED", decisionSource: "NONE", autoApproved: false }
  );
  assert.deepEqual(
    decideRosterApproval({
      approvalStatus: "PENDING",
      rosterEntry: { active: true },
    }),
    { approvalStatus: "APPROVED", decisionSource: "AUTOMATIC", autoApproved: true }
  );
  assert.deepEqual(
    decideRosterApproval({
      approvalStatus: "PENDING",
      rosterEntry: { active: false },
    }),
    { approvalStatus: "PENDING", decisionSource: "NONE", autoApproved: false }
  );
  assert.deepEqual(
    decideRosterApproval({
      approvalStatus: null,
      rosterEntry: null,
    }),
    { approvalStatus: "PENDING", decisionSource: "NONE", autoApproved: false }
  );
});

test("a decision of an administrator is never replaced by the automatic path", () => {
  // The administrator put the account back into PENDING. The roster matches
  // the account, but the automatic path must not approve it.
  assert.deepEqual(
    decideRosterApproval({
      approvalStatus: "PENDING",
      decisionSource: "ADMINISTRATOR",
      rosterEntry: { active: true },
    }),
    { approvalStatus: "PENDING", decisionSource: "ADMINISTRATOR", autoApproved: false }
  );

  // The same account without the column, but with the administrator id, is
  // protected in exactly the same way.
  assert.deepEqual(
    decideRosterApproval({
      approvalStatus: "PENDING",
      decisionSource: "ADMINISTRATOR",
      rosterEntry: { active: true },
    }),
    { approvalStatus: "PENDING", decisionSource: "ADMINISTRATOR", autoApproved: false }
  );

  // A rejected account stays rejected, whatever the roster says.
  assert.deepEqual(
    decideRosterApproval({
      approvalStatus: "REJECTED",
      decisionSource: "ADMINISTRATOR",
      rosterEntry: { active: true },
    }),
    { approvalStatus: "REJECTED", decisionSource: "ADMINISTRATOR", autoApproved: false }
  );

  // An approved account keeps its state and its source.
  assert.deepEqual(
    decideRosterApproval({
      approvalStatus: "APPROVED",
      decisionSource: "ADMINISTRATOR",
      rosterEntry: { active: false },
    }),
    { approvalStatus: "APPROVED", decisionSource: "ADMINISTRATOR", autoApproved: false }
  );
});

test("the effective decision source reads the administrator id as a second signal", () => {
  assert.equal(effectiveDecisionSource({}), "NONE");
  assert.equal(effectiveDecisionSource({ approvalDecisionSource: "NONE" }), "NONE");
  assert.equal(
    effectiveDecisionSource({ approvalDecisionSource: "AUTOMATIC" }),
    "AUTOMATIC"
  );
  assert.equal(
    effectiveDecisionSource({ approvalDecisionSource: "ADMINISTRATOR" }),
    "ADMINISTRATOR"
  );

  // The administrator id is never ignored, because a decision that was
  // recorded before the column existed still has to be authoritative.
  assert.equal(
    effectiveDecisionSource({ approvedById: "admin-1" }),
    "ADMINISTRATOR"
  );
  assert.equal(
    effectiveDecisionSource({
      approvalDecisionSource: "AUTOMATIC",
      approvedById: "admin-1",
    }),
    "ADMINISTRATOR"
  );
});

test("the approval filters are normalised to their canonical spelling", () => {
  assert.equal(normalizeApprovalStatus("approved"), "APPROVED");
  assert.equal(normalizeApprovalStatus(" Pending "), "PENDING");
  assert.equal(normalizeApprovalStatus("rejected"), "REJECTED");
  assert.equal(normalizeApprovalStatus("unknown"), null);
  assert.equal(normalizeApprovalStatus(undefined), null);

  assert.equal(normalizeApprovalDecisionSource("automatic"), "AUTOMATIC");
  assert.equal(
    normalizeApprovalDecisionSource(" administrator "),
    "ADMINISTRATOR"
  );
  assert.equal(normalizeApprovalDecisionSource("none"), "NONE");
  assert.equal(normalizeApprovalDecisionSource("robot"), null);

  assert.equal(isApprovalStatus("approved"), true);
  assert.equal(isApprovalStatus("nonsense"), false);
});

test("an inactive roster row is not a match and an account without a row is not blocked", () => {
  assert.equal(isRosterEntryActive(null), true);
  assert.equal(isRosterEntryActive({ active: true }), true);
  assert.equal(isRosterEntryActive({ active: false }), false);

  assert.equal(isRosterMatch(null), false);
  assert.equal(isRosterMatch({ active: true }), true);
  assert.equal(isRosterMatch({ active: false }), false);
});

test("a roster CSV is parsed with its header aliases", () => {
  const parsed = parseRosterCsv(
    [
      "Email Address,Cadet Name,University PRN,NCC Wing,Academic Year",
      "cadet@mitwpu.edu.in,Example Cadet,1032200123,Army,1st Year",
    ].join("\n")
  );

  assert.deepEqual(parsed.header, [
    "email",
    "fullName",
    "prn",
    "wing",
    "year",
  ]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].line, 2);
  assert.equal(parsed.rows[0].record.email, "cadet@mitwpu.edu.in");
  assert.equal(parsed.rows[0].record.fullName, "Example Cadet");
});

test("a roster CSV without an email column is rejected", () => {
  const parsed = parseRosterCsv("name,wing\nExample Cadet,Army");

  assert.equal(parsed.missingHeader, true);
  assert.deepEqual(parsed.rows, []);
});

test("roster rows outside the college domain are rejected with a line number", () => {
  const result = parseAndValidateRosterCsv(
    [
      "email,full name",
      "cadet@mitwpu.edu.in,Example Cadet",
      "someone@gmail.com,Personal Account",
      "other@mitwpu.edu.in,Another Cadet",
    ].join("\n"),
    { allowedEmailDomains: DOMAINS }
  );

  assert.equal(result.valid.length, 2);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.invalid[0].line, 3);
  assert.equal(result.invalid[0].email, "someone@gmail.com");
  assert.match(result.invalid[0].error, /college domain/i);
});

test("roster rows need a name and cannot repeat an email", () => {
  const result = parseAndValidateRosterCsv(
    [
      "email,full name",
      "cadet@mitwpu.edu.in,",
      "cadet@mitwpu.edu.in,Example Cadet",
    ].join("\n"),
    { allowedEmailDomains: DOMAINS }
  );

  assert.equal(result.valid.length, 0);
  assert.equal(result.invalid.length, 2);
  assert.equal(result.invalid[0].line, 2);
  assert.match(result.invalid[0].error, /name is required/i);
  assert.equal(result.invalid[1].line, 3);
  assert.match(result.invalid[1].error, /duplicate/i);
});

test("a roster import is limited to 500 rows", () => {
  const rows = Array.from(
    { length: ROSTER_MAX_ROWS + 1 },
    (_, index) => `cadet${index}@mitwpu.edu.in,Cadet ${index}`
  ).join("\n");

  const result = parseAndValidateRosterCsv(`email,full name\n${rows}`, {
    allowedEmailDomains: DOMAINS,
  });

  assert.equal(result.valid.length, 0);
  assert.equal(result.invalid.length, 1);
  assert.match(result.invalid[0].error, /500 rows/);
});

test("the roster row validation can be used on its own", () => {
  const result = validateRosterRows(
    [{ line: 7, record: { email: "cadet@mitwpu.edu.in", fullName: "Example" } }],
    { allowedEmailDomains: DOMAINS }
  );

  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].line, 7);
  assert.equal(result.valid[0].prn, null);
});
