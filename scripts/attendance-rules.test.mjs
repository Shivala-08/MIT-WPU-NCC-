import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activityTypeSpellings,
  buildFallbackWindow,
  buildSessionWindow,
  canTransitionSession,
  isWithinCheckInWindow,
  normalizeActivityType,
  normalizeAttendanceStatus,
  normalizeLeaveType,
  resolvePolicyActivityTypes,
  validateLeaveInput,
  validateMarks,
  validateSessionInput,
} from "../src/lib/attendance-rules.mjs";
import {
  calculateAttendance,
  summarizeBySession,
} from "../src/lib/attendance-calculator.mjs";
import { escapeCsvValue, toCsv } from "../src/lib/attendance-csv.mjs";
import {
  buildActivityTotals,
  buildSessionFilter,
} from "../src/lib/attendance-reports.mjs";
import { createRateLimiter } from "../src/lib/rate-limit.mjs";

test("the activity type is normalised from the names the unit uses", () => {
  assert.equal(normalizeActivityType("Parade"), "PARADE");
  assert.equal(normalizeActivityType("morning parade"), "PARADE");
  assert.equal(normalizeActivityType("physical training"), "PHYSICAL_TRAINING");
  assert.equal(normalizeActivityType("drill practice"), "DRILL");
  assert.equal(normalizeActivityType("NCC Camp"), "CAMP");
  assert.equal(normalizeActivityType("something else"), null);
  assert.equal(normalizeActivityType(42), null);
});

test("the attendance status only accepts the controlled set", () => {
  assert.equal(normalizeAttendanceStatus("present"), "PRESENT");
  assert.equal(normalizeAttendanceStatus(" on duty "), "ON_DUTY");
  assert.equal(normalizeAttendanceStatus("WHATEVER"), null);
});

test("the leave type only accepts the controlled set", () => {
  assert.equal(normalizeLeaveType("medical"), "MEDICAL");
  assert.equal(normalizeLeaveType("vacation"), null);
});

test("a session needs a title, a valid date and a valid activity type", () => {
  const result = validateSessionInput({
    title: "Morning parade",
    activityType: "Parade",
    date: "2026-11-02",
    startTime: "06:30",
    endTime: "09:30",
  });

  assert.equal(result.ok, true);
  assert.equal(result.values.title, "Morning parade");
  assert.equal(result.values.activityType, "PARADE");
  assert.equal(result.values.startTime, "06:30");

  const missingTitle = validateSessionInput({
    activityType: "PARADE",
    date: "2026-11-02",
  });

  assert.equal(missingTitle.ok, false);
  assert.equal(missingTitle.errors[0].field, "title");

  const badDate = validateSessionInput({
    title: "Morning parade",
    activityType: "PARADE",
    date: "02-11-2026",
  });

  assert.equal(badDate.ok, false);
  assert.equal(badDate.errors[0].field, "date");

  const badType = validateSessionInput({
    title: "Morning parade",
    activityType: "Picnic",
    date: "2026-11-02",
  });

  assert.equal(badType.ok, false);
  assert.equal(badType.errors[0].field, "activityType");
});

test("the end time has to be later than the start time", () => {
  const result = validateSessionInput({
    title: "Morning parade",
    activityType: "PARADE",
    date: "2026-11-02",
    startTime: "10:00",
    endTime: "09:00",
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, "endTime");
});

test("the venue length is limited", () => {
  const result = validateSessionInput({
    title: "Morning parade",
    activityType: "PARADE",
    date: "2026-11-02",
    venue: "x".repeat(200),
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, "venue");
});

test("the session window is built in the unit time zone", () => {
  const window = buildSessionWindow("2026-11-02", "06:30", "09:30");

  assert.equal(window.startsAt.toISOString(), "2026-11-02T01:00:00.000Z");
  assert.equal(window.endsAt.toISOString(), "2026-11-02T04:00:00.000Z");

  const fallback = buildFallbackWindow("2026-11-02");

  assert.equal(fallback.startsAt.toISOString(), "2026-11-01T18:30:00.000Z");
  assert.equal(fallback.endsAt.toISOString(), "2026-11-02T18:29:59.000Z");
});

test("a mark needs a cadet and a status of the controlled set", () => {
  const duplicate = validateMarks([
    { userId: "cadet-1", status: "PRESENT" },
    { userId: "cadet-1", status: "ABSENT" },
  ]);

  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors[0].message, /only be marked once/i);

  const badStatus = validateMarks([{ userId: "cadet-1", status: "WHATEVER" }]);

  assert.equal(badStatus.ok, false);
  assert.match(badStatus.errors[0].message, /Unsupported attendance status/);

  const empty = validateMarks([]);

  assert.equal(empty.ok, false);

  const valid = validateMarks([{ userId: "cadet-1", status: "late" }]);

  assert.equal(valid.ok, true);
  assert.equal(valid.marks[0].status, "LATE");
});

test("a leave request needs a valid range, a type and a reason", () => {
  const badRange = validateLeaveInput({
    type: "MEDICAL",
    reason: "Fever and rest",
    startDate: "2026-11-05",
    endDate: "2026-11-01",
  });

  assert.equal(badRange.ok, false);
  assert.equal(badRange.errors[0].field, "endDate");

  const badType = validateLeaveInput({
    type: "HOLIDAY",
    reason: "Fever and rest",
    startDate: "2026-11-01",
    endDate: "2026-11-05",
  });

  assert.equal(badType.ok, false);
  assert.equal(badType.errors[0].field, "type");

  const shortReason = validateLeaveInput({
    type: "MEDICAL",
    reason: "sick",
    startDate: "2026-11-01",
    endDate: "2026-11-05",
  });

  assert.equal(shortReason.ok, false);
  assert.equal(shortReason.errors[0].field, "reason");

  const valid = validateLeaveInput({
    type: "medical",
    reason: "Fever and rest",
    startDate: "2026-11-01",
    endDate: "2026-11-05",
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.values.type, "MEDICAL");
  assert.equal(valid.values.startDate.toISOString(), "2026-11-01T00:00:00.000Z");
});

test("the session lifecycle only allows the documented transitions", () => {
  assert.equal(canTransitionSession("DRAFT", "open"), true);
  assert.equal(canTransitionSession("OPEN", "open"), false);
  assert.equal(canTransitionSession("OPEN", "close"), true);
  assert.equal(canTransitionSession("CLOSED", "close"), false);
  assert.equal(canTransitionSession("DRAFT", "cancel"), true);
  assert.equal(canTransitionSession("OPEN", "cancel"), true);
  assert.equal(canTransitionSession("CLOSED", "cancel"), true);
  assert.equal(canTransitionSession("CANCELLED", "open"), false);
  assert.equal(canTransitionSession("CANCELLED", "close"), false);
  assert.equal(canTransitionSession("CANCELLED", "cancel"), false);
});

test("the check-in window covers the session with a short margin", () => {
  const session = {
    startsAt: new Date("2026-11-02T01:00:00.000Z"),
    endsAt: new Date("2026-11-02T04:00:00.000Z"),
  };

  assert.equal(
    isWithinCheckInWindow(session, new Date("2026-11-02T00:45:00.000Z")),
    true
  );
  assert.equal(
    isWithinCheckInWindow(session, new Date("2026-11-02T00:00:00.000Z")),
    false
  );
  assert.equal(
    isWithinCheckInWindow(session, new Date("2026-11-02T04:30:00.000Z")),
    true
  );
  assert.equal(
    isWithinCheckInWindow(session, new Date("2026-11-02T06:00:00.000Z")),
    false
  );
});

test("the calculation excludes the cancelled sessions", () => {
  const result = calculateAttendance({
    sessions: [
      { id: "s1", type: "PARADE", status: "CLOSED" },
      { id: "s2", type: "PARADE", status: "CANCELLED" },
    ],
    records: [
      { sessionId: "s1", status: "PRESENT" },
      { sessionId: "s2", status: "ABSENT" },
    ],
    policy: { version: 1, thresholdPercent: 75 },
  });

  assert.equal(result.totalSessions, 2);
  assert.equal(result.eligibleSessions, 1);
  assert.equal(result.present, 1);
  assert.equal(result.percentage, 100);
});

test("the late treatment follows the policy", () => {
  const sessions = [{ id: "s1", type: "PARADE", status: "CLOSED" }];
  const records = [{ sessionId: "s1", status: "LATE" }];

  const withoutLate = calculateAttendance({
    sessions,
    records,
    policy: { version: 1, lateCountsAsPresent: false },
  });

  assert.equal(withoutLate.late, 1);
  assert.equal(withoutLate.attended, 0);
  assert.equal(withoutLate.percentage, 0);

  const withLate = calculateAttendance({
    sessions,
    records,
    policy: { version: 1, lateCountsAsPresent: true },
  });

  assert.equal(withLate.attended, 1);
  assert.equal(withLate.percentage, 100);
});

test("an excused mark can leave the denominator", () => {
  const sessions = [
    { id: "s1", type: "PARADE", status: "CLOSED" },
    { id: "s2", type: "PARADE", status: "CLOSED" },
  ];
  const records = [
    { sessionId: "s1", status: "PRESENT" },
    { sessionId: "s2", status: "EXCUSED" },
  ];

  const excluded = calculateAttendance({
    sessions,
    records,
    policy: { version: 1, excusedExcludedFromDenominator: true },
  });

  assert.equal(excluded.denominator, 1);
  assert.equal(excluded.percentage, 100);

  const included = calculateAttendance({
    sessions,
    records,
    policy: { version: 1, excusedExcludedFromDenominator: false },
  });

  assert.equal(included.denominator, 2);
  assert.equal(included.percentage, 50);
});

test("a session without a mark counts as not attended", () => {
  const result = calculateAttendance({
    sessions: [{ id: "s1", type: "PARADE", status: "CLOSED" }],
    records: [],
    policy: { version: 1 },
  });

  assert.equal(result.unmarked, 1);
  assert.equal(result.denominator, 1);
  assert.equal(result.percentage, 0);
  assert.ok(result.explanation.some((line) => line.includes("no mark")));
});

test("the calculation handles a cadet without any session", () => {
  const result = calculateAttendance({
    sessions: [],
    records: [],
    policy: { version: 1 },
  });

  assert.equal(result.eligibleSessions, 0);
  assert.equal(result.denominator, 0);
  assert.equal(result.percentage, 0);
});

test("the threshold stays informational until the institution confirms it", () => {
  const sessions = [{ id: "s1", type: "PARADE", status: "CLOSED" }];
  const records = [{ sessionId: "s1", status: "PRESENT" }];

  const unconfirmed = calculateAttendance({
    sessions,
    records,
    policy: { version: 2, thresholdPercent: 75, thresholdConfirmed: false },
  });

  assert.equal(unconfirmed.aboveThreshold, null);
  assert.equal(unconfirmed.thresholdConfirmed, false);

  const confirmed = calculateAttendance({
    sessions,
    records,
    policy: { version: 3, thresholdPercent: 75, thresholdConfirmed: true },
  });

  assert.equal(confirmed.aboveThreshold, true);
  assert.equal(confirmed.policyVersion, 3);
});

test("the activity filter limits the sessions of the calculation", () => {
  const result = calculateAttendance({
    sessions: [
      { id: "s1", type: "PARADE", status: "CLOSED" },
      { id: "s2", type: "CAMP", status: "CLOSED" },
    ],
    records: [
      { sessionId: "s1", status: "PRESENT" },
      { sessionId: "s2", status: "ABSENT" },
    ],
    policy: { version: 1, activityTypes: ["PARADE"] },
  });

  assert.equal(result.eligibleSessions, 1);
  assert.equal(result.percentage, 100);
});

test("a legacy session is counted by the activity filter of the policy", () => {
  const result = calculateAttendance({
    sessions: [
      { id: "s1", type: "Parade", status: "CLOSED" },
      { id: "s2", type: "Camp", status: "CLOSED" },
    ],
    records: [
      { sessionId: "s1", status: "PRESENT" },
      { sessionId: "s2", status: "ABSENT" },
    ],
    policy: { version: 1, activityTypes: ["PARADE"] },
  });

  // The legacy session is not silently excluded by the filter.
  assert.equal(result.eligibleSessions, 1);
  assert.equal(result.present, 1);
  assert.equal(result.percentage, 100);
  assert.equal(result.unclassifiedSessions, 0);
});

test("a legacy session of a known alias is counted by the activity filter", () => {
  const result = calculateAttendance({
    sessions: [
      { id: "s1", type: "Weapon Training", status: "CLOSED" },
      { id: "s2", type: "Lecture", status: "CLOSED" },
    ],
    records: [
      { sessionId: "s1", status: "PRESENT" },
      { sessionId: "s2", status: "ABSENT" },
    ],
    policy: { version: 1, activityTypes: ["TRAINING"] },
  });

  assert.equal(result.present, 1);
  // The lecture is outside the controlled vocabulary. It is counted and it is
  // reported, but it is never counted as a training.
  assert.equal(result.unclassifiedSessions, 1);
  assert.deepEqual(result.unclassifiedActivityTypes, ["Lecture"]);
});

test("an unknown activity type is never counted as another activity type", () => {
  const result = calculateAttendance({
    sessions: [{ id: "s1", type: "Weapon Firing", status: "CLOSED" }],
    records: [{ sessionId: "s1", status: "PRESENT" }],
    policy: { version: 1, activityTypes: ["DRILL"] },
  });

  assert.equal(result.unclassifiedSessions, 1);
  assert.deepEqual(result.unclassifiedActivityTypes, ["Weapon Firing"]);
  assert.equal(
    result.explanation.some((line) => line.includes("outside the controlled vocabulary")),
    true
  );
});

test("an unknown activity type is not silently excluded from the calculation", () => {
  const result = calculateAttendance({
    sessions: [{ id: "s1", type: "Weapon Firing", status: "CLOSED" }],
    records: [{ sessionId: "s1", status: "PRESENT" }],
    policy: { version: 1, activityTypes: ["PARADE"] },
  });

  // The session is counted, so the history of the cadet is never lost.
  assert.equal(result.eligibleSessions, 1);
  assert.equal(result.denominator, 1);
  assert.equal(result.present, 1);
});

test("an explicit spelling in the policy matches the session of the unit", () => {
  const result = calculateAttendance({
    sessions: [{ id: "s1", type: "Weapon Firing", status: "CLOSED" }],
    records: [{ sessionId: "s1", status: "PRESENT" }],
    policy: { version: 1, activityTypes: ["WEAPON FIRING"] },
  });

  assert.equal(result.eligibleSessions, 1);
  assert.equal(result.unclassifiedSessions, 0);
});

test("the stored spellings of a canonical activity type are collected", () => {
  const spellings = activityTypeSpellings("PARADE");

  assert.equal(spellings.includes("PARADE"), true);
  assert.equal(spellings.includes("MORNING PARADE"), true);

  const training = activityTypeSpellings("TRAINING");
  assert.equal(training.includes("TRAINING"), true);
  assert.equal(training.includes("WEAPON TRAINING"), true);

  assert.deepEqual(activityTypeSpellings(""), []);
});

test("the policy activity types are split into canonical and explicit values", () => {
  const resolved = resolvePolicyActivityTypes([
    "PARADE",
    "Parade",
    "Weapon Firing",
    "",
  ]);

  assert.deepEqual([...resolved.canonical], ["PARADE"]);
  assert.deepEqual([...resolved.explicit], ["WEAPON FIRING"]);
});

test("a cancelled legacy session is still excluded", () => {
  const result = calculateAttendance({
    sessions: [{ id: "s1", type: "Parade", status: "CANCELLED" }],
    records: [{ sessionId: "s1", status: "PRESENT" }],
    policy: { version: 1, activityTypes: ["PARADE"] },
  });

  assert.equal(result.eligibleSessions, 0);
});

test("the report filter matches the legacy spellings of a canonical type", () => {
  const where = buildSessionFilter({ from: null, to: null, type: "PARADE" });

  assert.equal(Array.isArray(where.type.in), true);
  assert.equal(where.type.in.includes("PARADE"), true);
  assert.equal(where.type.in.includes("MORNING PARADE"), true);
});

test("the report filter keeps a spelling that is outside the vocabulary", () => {
  const where = buildSessionFilter({
    from: null,
    to: null,
    type: "Weapon Firing",
  });

  assert.equal(where.type, "Weapon Firing");
});

test("the activity totals group a legacy spelling with its canonical form", () => {
  const totals = buildActivityTotals([
    { type: "PARADE", marked: 10, attended: 8 },
    { type: "Parade", marked: 5, attended: 5 },
  ]);

  assert.equal(totals.length, 1);
  assert.equal(totals[0].group, "PARADE");
  assert.equal(totals[0].sessions, 2);
  assert.equal(totals[0].marked, 15);
  assert.equal(totals[0].attended, 13);
});

test("an unknown activity type keeps its own group in the totals", () => {
  const totals = buildActivityTotals([
    { type: "Weapon Firing", marked: 4, attended: 2 },
  ]);

  assert.equal(totals.length, 1);
  assert.equal(totals[0].group, "Weapon Firing");
});

test("the session summary counts every status", () => {
  const rows = summarizeBySession({
    sessions: [{ id: "s1", title: "Parade", type: "PARADE", date: new Date(), status: "CLOSED" }],
    records: [
      { sessionId: "s1", status: "PRESENT" },
      { sessionId: "s1", status: "ON_DUTY" },
      { sessionId: "s1", status: "ABSENT" },
    ],
    policy: { version: 1 },
  });

  assert.equal(rows[0].marked, 3);
  assert.equal(rows[0].attended, 2);
  assert.equal(rows[0].ABSENT, 1);
  assert.equal(rows[0].percentage, 66.67);
});

test("the csv writer escapes the values", () => {
  assert.equal(escapeCsvValue("plain"), "plain");
  assert.equal(escapeCsvValue("a,b"), '"a,b"');
  assert.equal(escapeCsvValue('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvValue("line\nbreak"), '"line\nbreak"');
  assert.equal(escapeCsvValue(null), "");
});

test("the csv writer neutralises a formula in a value", () => {
  assert.equal(escapeCsvValue("=cmd|calc"), "'=cmd|calc");
  assert.equal(escapeCsvValue("+1"), "'+1");
  assert.equal(escapeCsvValue("-1"), "'-1");
  assert.equal(escapeCsvValue("@sum"), "'@sum");
});

test("the csv writer only writes the declared columns", () => {
  const csv = toCsv(
    [
      {
        sessionTitle: "Parade",
        status: "PRESENT",
        password: "secret",
      },
    ],
    [
      { key: "sessionTitle", header: "session_title" },
      { key: "status", header: "attendance_status" },
    ]
  );

  assert.equal(csv, "session_title,attendance_status\nParade,PRESENT");
  assert.equal(csv.includes("secret"), false);
});

test("the rate limiter blocks the calls above the limit", () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });

  assert.equal(limiter("cadet-1").allowed, true);
  assert.equal(limiter("cadet-1").allowed, true);

  const blocked = limiter("cadet-1");

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0);

  assert.equal(limiter("cadet-2").allowed, true);
});
