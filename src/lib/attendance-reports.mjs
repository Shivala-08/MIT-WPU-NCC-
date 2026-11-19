import { calculateAttendance, summarizeBySession } from "./attendance-calculator.mjs";
import { eligibleCadetWhere } from "./attendance-eligibility.mjs";
import {
  activityTypeSpellings,
  normalizeActivityType,
} from "./attendance-rules.mjs";

const CADET_SELECT = {
  id: true,
  name: true,
  email: true,
  cadetProfile: {
    select: {
      fullName: true,
      prn: true,
      regiNumber: true,
      wing: true,
      division: true,
      year: true,
      branch: true,
    },
  },
};

export function buildSessionFilter({ from, to, type }) {
  const where = {};

  if (from || to) {
    where.date = {};

    if (from) {
      where.date.gte = new Date(`${from}T00:00:00.000Z`);
    }

    if (to) {
      where.date.lte = new Date(`${to}T23:59:59.999Z`);
    }
  }

  if (type) {
    // The activity type of a session was free text before phase 3. A filter
    // on a canonical type has to match the legacy spellings as well, so the
    // sessions of the earlier phases do not disappear from the report.
    const canonical = normalizeActivityType(type);

    if (canonical) {
      where.type = { in: activityTypeSpellings(canonical) };
    } else {
      where.type = type;
    }
  }

  return where;
}

export function buildCadetFilter({ wing, division, search }) {
  // The report covers the cadets of the current unit. A deactivated account
  // and a cadet whose roster row is inactive are not part of it any more.
  // The filter is applied to the current set of cadets only, never to the
  // historical rows of the attendance.
  const where = eligibleCadetWhere();

  if (wing) {
    where.cadetProfile = { ...(where.cadetProfile ?? {}), wing };
  }

  if (division) {
    where.cadetProfile = { ...(where.cadetProfile ?? {}), division };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      {
        cadetProfile: {
          is: {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { prn: { contains: search, mode: "insensitive" } },
              { regiNumber: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }

  return where;
}

export async function loadAttendanceReport(
  db,
  { from = null, to = null, type = null, wing = null, division = null, search = null } = {}
) {
  const sessions = await db.attendanceSession.findMany({
    where: buildSessionFilter({ from, to, type }),
    select: {
      id: true,
      title: true,
      type: true,
      date: true,
      venue: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
    orderBy: { date: "asc" },
    take: 1000,
  });

  const cadets = await db.user.findMany({
    where: buildCadetFilter({ wing, division, search }),
    select: CADET_SELECT,
    orderBy: { name: "asc" },
    take: 1000,
  });

  const sessionIds = sessions.map((session) => session.id);
  const cadetIds = cadets.map((cadet) => cadet.id);

  const records =
    sessionIds.length > 0 && cadetIds.length > 0
      ? await db.attendance.findMany({
          where: {
            sessionId: { in: sessionIds },
            userId: { in: cadetIds },
          },
          include: {
            user: { select: CADET_SELECT },
            markedBy: { select: { id: true, name: true } },
          },
          orderBy: { markedAt: "asc" },
          take: 20_000,
        })
      : [];

  return { sessions, cadets, records };
}

export function buildCadetWiseReport({ sessions, cadets, records, policy }) {
  const recordsByCadet = new Map();

  for (const record of records) {
    if (!recordsByCadet.has(record.userId)) {
      recordsByCadet.set(record.userId, []);
    }

    recordsByCadet.get(record.userId).push(record);
  }

  return cadets.map((cadet) => {
    const summary = calculateAttendance({
      sessions,
      records: recordsByCadet.get(cadet.id) ?? [],
      policy,
    });

    return {
      userId: cadet.id,
      name: cadet.name,
      email: cadet.email,
      fullName: cadet.cadetProfile?.fullName ?? cadet.name,
      prn: cadet.cadetProfile?.prn ?? null,
      regiNumber: cadet.cadetProfile?.regiNumber ?? null,
      wing: cadet.cadetProfile?.wing ?? null,
      division: cadet.cadetProfile?.division ?? null,
      year: cadet.cadetProfile?.year ?? null,
      branch: cadet.cadetProfile?.branch ?? null,
      ...summary,
    };
  });
}

export function buildSessionWiseReport({ sessions, records, policy }) {
  return summarizeBySession({ sessions, records, policy });
}

export function buildGroupTotals(rows, key) {
  const groups = new Map();

  for (const row of rows) {
    const groupKey = row[key] ?? "Unassigned";

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        group: groupKey,
        cadets: 0,
        eligibleSessions: 0,
        attended: 0,
        percentageSum: 0,
      });
    }

    const group = groups.get(groupKey);

    group.cadets += 1;
    group.eligibleSessions += row.eligibleSessions;
    group.attended += row.attended;
    group.percentageSum += row.percentage;
  }

  return [...groups.values()].map((group) => ({
    ...group,
    percentage:
      group.cadets > 0
        ? Math.round((group.percentageSum / group.cadets) * 100) / 100
        : 0,
  }));
}

export function buildActivityTotals(sessionRows) {
  const groups = new Map();

  for (const row of sessionRows) {
    // The totals are grouped by the canonical activity type, so a legacy
    // spelling and its canonical form are one group and not two. The session
    // row itself keeps the original spelling for the display.
    const groupKey = normalizeActivityType(row.type) ?? row.type ?? "OTHER";

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        group: groupKey,
        sessions: 0,
        marked: 0,
        attended: 0,
      });
    }

    const group = groups.get(groupKey);

    group.sessions += 1;
    group.marked += row.marked;
    group.attended += row.attended;
  }

  return [...groups.values()].map((group) => ({
    ...group,
    percentage:
      group.marked > 0
        ? Math.round((group.attended / group.marked) * 10000) / 100
        : 0,
  }));
}
