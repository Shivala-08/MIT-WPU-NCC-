import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { readPolicy } from "@/lib/attendance-policy.mjs";
import {
  buildActivityTotals,
  buildCadetWiseReport,
  buildGroupTotals,
  buildSessionWiseReport,
  loadAttendanceReport,
} from "@/lib/attendance-reports.mjs";
import { canReadReports } from "@/lib/attendance-permissions.mjs";
import { parseDateQuery, queryString, serviceErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canReadReports(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = parseDateQuery(queryString(req, "from"));
  const to = parseDateQuery(queryString(req, "to"));

  if (from === undefined || to === undefined) {
    return NextResponse.json(
      { error: "The from and to filters have to use the YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  const type = queryString(req, "type");
  const wing = queryString(req, "wing");
  const division = queryString(req, "division");
  const search = queryString(req, "search");

  try {
    const [policy, data] = await Promise.all([
      readPolicy(prisma),
      loadAttendanceReport(prisma, {
        from,
        to,
        type,
        wing,
        division,
        search,
      }),
    ]);

    const cadetRows = buildCadetWiseReport({ ...data, policy });
    const sessionRows = buildSessionWiseReport({ ...data, policy });

    const totals = cadetRows.reduce(
      (accumulator, row) => ({
        eligibleSessions: accumulator.eligibleSessions + row.eligibleSessions,
        attended: accumulator.attended + row.attended,
        present: accumulator.present + row.present,
        late: accumulator.late + row.late,
        absent: accumulator.absent + row.absent,
        excused: accumulator.excused + row.excused,
      }),
      {
        eligibleSessions: 0,
        attended: 0,
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
      }
    );

    return NextResponse.json({
      totals: {
        ...totals,
        // The count follows the listed sessions. A cancelled session is never
        // part of the report.
        sessions: sessionRows.length,
        cadets: data.cadets.length,
        percentage:
          totals.eligibleSessions > 0
            ? Math.round((totals.attended / totals.eligibleSessions) * 10000) / 100
            : 0,
      },
      byWing: buildGroupTotals(cadetRows, "wing"),
      byDivision: buildGroupTotals(cadetRows, "division"),
      byActivity: buildActivityTotals(sessionRows),
      cadets: cadetRows,
      sessions: sessionRows,
      policy: {
        version: policy.version,
        thresholdPercent: policy.thresholdPercent,
        thresholdConfirmed: policy.thresholdConfirmed,
        lateCountsAsPresent: policy.lateCountsAsPresent,
        excusedExcludedFromDenominator: policy.excusedExcludedFromDenominator,
        activityTypes: policy.activityTypes ?? [],
        notes: policy.notes ?? null,
      },
    });
  } catch (error) {
    return serviceErrorResponse(error, "The report could not be built");
  }
}
