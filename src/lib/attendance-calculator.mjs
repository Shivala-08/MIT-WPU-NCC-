import {
  normalizeActivityType,
  resolvePolicyActivityTypes,
} from "./attendance-rules.mjs";

export const DEFAULT_POLICY = Object.freeze({
  id: "default",
  version: 1,
  thresholdPercent: 75,
  thresholdConfirmed: false,
  lateCountsAsPresent: false,
  excusedExcludedFromDenominator: true,
  activityTypes: [],
  notes: null,
});

const ATTENDED_ALWAYS = new Set(["PRESENT", "ON_DUTY"]);
const EXCUSED = new Set(["EXCUSED", "LEAVE"]);

function normalizeStatus(value) {
  if (typeof value !== "string") {
    return null;
  }

  const key = value.trim().toUpperCase().replace(/\s+/g, "_");

  return key.length > 0 ? key : null;
}

export function resolvePolicy(policy) {
  return {
    ...DEFAULT_POLICY,
    ...(policy ?? {}),
    activityTypes: Array.isArray(policy?.activityTypes)
      ? policy.activityTypes
      : [],
  };
}

/**
 * Calculates the attendance summary of one cadet.
 *
 * The result is informational. The institution has not confirmed an official
 * attendance threshold yet, so the threshold comparison is only reported when
 * the policy is marked as confirmed.
 */
export function calculateAttendance({
  sessions = [],
  records = [],
  policy = null,
} = {}) {
  const resolved = resolvePolicy(policy);

  const recordsBySession = new Map();

  for (const record of records) {
    if (!record?.sessionId) {
      continue;
    }

    recordsBySession.set(record.sessionId, normalizeStatus(record.status));
  }

  // The activity type of a session was free text before phase 3. The policy
  // and the sessions are compared in their canonical form, so a session of the
  // earlier phases is not silently dropped by a filter on the activity type.
  const policyTypes = resolvePolicyActivityTypes(resolved.activityTypes);
  const hasActivityFilter =
    policyTypes.canonical.size > 0 || policyTypes.explicit.size > 0;

  let unclassifiedSessions = 0;
  const unclassifiedActivityTypes = new Set();

  const eligibleSessions = sessions.filter((session) => {
    if (!session?.id || session.status === "CANCELLED") {
      return false;
    }

    const canonical = normalizeActivityType(session.type);

    if (!hasActivityFilter) {
      // Every activity type is counted. The spelling of a legacy session is
      // only reported, it never changes the result.
      if (!canonical) {
        unclassifiedSessions += 1;
        unclassifiedActivityTypes.add(String(session.type ?? "").trim());
      }

      return true;
    }

    if (canonical) {
      return policyTypes.canonical.has(canonical);
    }

    const explicit = String(session.type ?? "").trim().toUpperCase();

    if (policyTypes.explicit.has(explicit)) {
      return true;
    }

    // The activity type of the session is outside the controlled vocabulary,
    // so it cannot be matched against the policy. The session is never dropped
    // silently: it is counted and reported, and it is never counted as
    // another activity type either.
    unclassifiedSessions += 1;
    unclassifiedActivityTypes.add(String(session.type ?? "").trim());

    return true;
  });

  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;
  let unmarked = 0;

  for (const session of eligibleSessions) {
    const status = recordsBySession.get(session.id) ?? null;

    if (!status) {
      unmarked += 1;
      continue;
    }

    if (ATTENDED_ALWAYS.has(status)) {
      present += 1;
      continue;
    }

    if (status === "LATE") {
      late += 1;
      continue;
    }

    if (status === "ABSENT") {
      absent += 1;
      continue;
    }

    if (EXCUSED.has(status)) {
      excused += 1;
      continue;
    }

    unmarked += 1;
  }

  const attended =
    present + (resolved.lateCountsAsPresent ? late : 0);

  const denominator = Math.max(
    eligibleSessions.length - (resolved.excusedExcludedFromDenominator ? excused : 0),
    0
  );

  const percentage =
    denominator > 0 ? Math.round((attended / denominator) * 10000) / 100 : 0;

  const aboveThreshold = resolved.thresholdConfirmed
    ? percentage >= resolved.thresholdPercent
    : null;

  const explanation = [
    `Eligible sessions: ${eligibleSessions.length}. Cancelled sessions are never counted.`,
    resolved.activityTypes.length > 0
      ? `Only these activity types are counted: ${resolved.activityTypes.join(", ")}.`
      : "Every activity type is counted.",
    `Present and on duty count as attended. ${
      resolved.lateCountsAsPresent
        ? "Late attendance counts as attended."
        : "Late attendance does not count as attended."
    }`,
    resolved.excusedExcludedFromDenominator
      ? "Excused and leave marks are not part of the denominator."
      : "Excused and leave marks are part of the denominator.",
    `${unmarked} session(s) have no mark and are counted as not attended.`,
    ...(unclassifiedSessions > 0
      ? [
          `${unclassifiedSessions} session(s) use an activity type outside the controlled vocabulary (${[
            ...unclassifiedActivityTypes,
          ]
            .sort()
            .join(", ")}). They are counted, because they cannot be matched against the policy, and they are never counted as another activity type.`,
        ]
      : []),
    `Policy version ${resolved.version}.`,
    resolved.thresholdConfirmed
      ? `The threshold of ${resolved.thresholdPercent}% is confirmed by the institution.`
      : `The threshold of ${resolved.thresholdPercent}% is a configurable placeholder and is not confirmed by the institution. The result is informational only.`,
  ];

  return {
    totalSessions: sessions.length,
    eligibleSessions: eligibleSessions.length,
    denominator,
    present,
    late,
    absent,
    excused,
    unmarked,
    unclassifiedSessions,
    unclassifiedActivityTypes: [...unclassifiedActivityTypes].sort(),
    attended,
    percentage,
    policyVersion: resolved.version,
    thresholdPercent: resolved.thresholdPercent,
    thresholdConfirmed: resolved.thresholdConfirmed,
    aboveThreshold,
    explanation,
  };
}

export function summarizeByCadet({ sessions = [], records = [], policy = null } = {}) {
  const resolved = resolvePolicy(policy);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const byCadet = new Map();

  for (const record of records) {
    const session = sessionsById.get(record.sessionId);

    if (!session) {
      continue;
    }

    const key = record.userId;

    if (!byCadet.has(key)) {
      byCadet.set(key, { userId: key, sessions: [], records: [] });
    }

    const entry = byCadet.get(key);

    entry.sessions.push(session);
    entry.records.push(record);
  }

  return [...byCadet.values()].map((entry) => ({
    userId: entry.userId,
    ...calculateAttendance({
      sessions: entry.sessions,
      records: entry.records,
      policy: resolved,
    }),
  }));
}

export function summarizeBySession({ sessions = [], records = [], policy = null } = {}) {
  const resolved = resolvePolicy(policy);

  return sessions
    .filter((session) => session.status !== "CANCELLED")
    .map((session) => {
      const sessionRecords = records.filter(
        (record) => record.sessionId === session.id
      );

      const totals = {
        PRESENT: 0,
        ABSENT: 0,
        ON_DUTY: 0,
        LEAVE: 0,
        LATE: 0,
        EXCUSED: 0,
      };

      for (const record of sessionRecords) {
        const status = normalizeStatus(record.status);

        if (status && totals[status] !== undefined) {
          totals[status] += 1;
        }
      }

      const attended =
        totals.PRESENT + totals.ON_DUTY + (resolved.lateCountsAsPresent ? totals.LATE : 0);

      const marked = sessionRecords.length;

      return {
        sessionId: session.id,
        title: session.title,
        type: session.type,
        date: session.date,
        marked,
        attended,
        percentage: marked > 0 ? Math.round((attended / marked) * 10000) / 100 : 0,
        ...totals,
      };
    });
}
