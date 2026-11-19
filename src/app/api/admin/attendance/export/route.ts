import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { readPolicy } from "@/lib/attendance-policy.mjs";
import { loadAttendanceReport } from "@/lib/attendance-reports.mjs";
import { canExportAttendance } from "@/lib/attendance-permissions.mjs";
import { toCsv } from "@/lib/attendance-csv.mjs";
import { runInTransaction, writeAudit } from "@/lib/attendance-service.mjs";
import { parseDateQuery, queryString, serviceErrorResponse } from "@/lib/http";

const COLUMNS = [
  { key: "sessionTitle", header: "session_title" },
  { key: "sessionDate", header: "session_date" },
  { key: "activityType", header: "activity_type" },
  { key: "venue", header: "venue" },
  { key: "sessionStatus", header: "session_status" },
  { key: "cadetName", header: "cadet_name" },
  { key: "prn", header: "prn" },
  { key: "regiNumber", header: "regi_number" },
  { key: "wing", header: "wing" },
  { key: "division", header: "division" },
  { key: "year", header: "year" },
  { key: "branch", header: "branch" },
  { key: "status", header: "attendance_status" },
  { key: "method", header: "marked_via" },
  { key: "markedAt", header: "marked_at" },
  { key: "markedBy", header: "marked_by" },
];

export async function GET(req: Request) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canExportAttendance(authz.user.role)) {
    return NextResponse.json(
      { error: "Only an administrator can export attendance records" },
      { status: 403 }
    );
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

    const sessionById = new Map(
      data.sessions.map((session) => [session.id, session])
    );

    const rows = data.records.map((record) => {
      const session = sessionById.get(record.sessionId);
      const profile = record.user?.cadetProfile ?? null;

      return {
        sessionTitle: session?.title ?? "",
        sessionDate: session?.date
          ? new Date(session.date).toISOString().slice(0, 10)
          : "",
        activityType: session?.type ?? "",
        venue: session?.venue ?? "",
        sessionStatus: session?.status ?? "",
        cadetName: profile?.fullName ?? record.user?.name ?? "",
        prn: profile?.prn ?? "",
        regiNumber: profile?.regiNumber ?? "",
        wing: profile?.wing ?? "",
        division: profile?.division ?? "",
        year: profile?.year ?? "",
        branch: profile?.branch ?? "",
        status: record.status,
        method: record.method,
        markedAt: record.markedAt
          ? new Date(record.markedAt).toISOString()
          : "",
        markedBy: record.markedBy?.name ?? "",
      };
    });

    const csv = `\uFEFF${toCsv(rows, COLUMNS)}`;

    await runInTransaction(prisma, (tx) =>
      writeAudit(tx, {
        actorId: authz.user.id,
        action: "ATTENDANCE_REPORT_EXPORTED",
        entity: "Attendance",
        entityId: null,
        oldData: null,
        newData: {
          from,
          to,
          type,
          wing,
          division,
          rows: rows.length,
          policyVersion: policy.version,
        },
      })
    );

    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ncc-attendance-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return serviceErrorResponse(error, "The export could not be created");
  }
}
