"use client";

import { formatCalendarDate, formatIstTime } from "@/lib/calendar-date.mjs";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  MapPin,
  QrCode,
  RefreshCw,
  XCircle,
} from "lucide-react";

type Summary = {
  totalSessions: number;
  eligibleSessions: number;
  denominator: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
  attended: number;
  percentage: number;
  policyVersion: number;
  thresholdPercent: number;
  thresholdConfirmed: boolean;
  aboveThreshold: boolean | null;
  explanation: string[];
};

type RecordRow = {
  id: string;
  status: string;
  method: string;
  note: string | null;
  markedAt: string;
  session: {
    id: string;
    title: string;
    type: string;
    date: string;
    venue: string | null;
    status: string;
  };
};

type OpenSession = {
  id: string;
  title: string;
  type: string;
  date: string;
  venue: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
};

const MARK_CLASS: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800",
  ON_DUTY: "bg-blue-100 text-blue-800",
  LATE: "bg-amber-100 text-amber-800",
  ABSENT: "bg-red-100 text-red-700",
  EXCUSED: "bg-purple-100 text-purple-800",
  LEAVE: "bg-teal-100 text-teal-800",
};

export default function CadetAttendanceClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [openSessions, setOpenSessions] = useState<OpenSession[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<OpenSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [summaryResponse, sessionsResponse] = await Promise.all([
        fetch("/api/attendance/summary"),
        fetch("/api/attendance/sessions"),
      ]);

      if (!summaryResponse.ok) {
        const payload = await summaryResponse.json().catch(() => ({}));
        throw new Error(payload.error ?? "The attendance could not be loaded");
      }

      const summaryPayload = await summaryResponse.json();

      setSummary(summaryPayload.summary);
      setRecords(summaryPayload.records ?? []);

      if (sessionsResponse.ok) {
        const sessionsPayload = await sessionsResponse.json();
        setOpenSessions(sessionsPayload.open ?? []);
        setUpcomingSessions(sessionsPayload.upcoming ?? []);
      }
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "The attendance could not be loaded"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();

      if (!cancelled) {
        await load();
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [load]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading the attendance
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="bg-red-50 border border-red-300 rounded-2xl p-5 flex items-start gap-3 text-red-900">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-bold">The attendance could not be loaded</p>
            <p className="text-sm mt-1">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold underline"
            >
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const percentage = summary?.percentage ?? 0;

  return (
    <div className="py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8">
        <header className="bg-ncc-dark-blue text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <h1 className="font-heading font-black text-xl sm:text-2xl">
            My attendance
          </h1>
          <p className="text-white/70 text-xs sm:text-sm mt-2">
            Your own record for the sessions of the unit.
          </p>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
              Attendance
            </p>
            <p className="text-xl sm:text-3xl font-heading font-black text-ncc-dark-blue mt-2">
              {percentage}%
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
              {summary?.attended ?? 0} attended of {summary?.denominator ?? 0}{" "}
              eligible sessions
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
              Present / On duty
            </p>
            <p className="text-xl sm:text-3xl font-heading font-black text-emerald-600 mt-2">
              {summary?.present ?? 0}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
              {summary?.late ?? 0} late
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
              Absences
            </p>
            <p className="text-xl sm:text-3xl font-heading font-black text-red-600 mt-2">
              {summary?.absent ?? 0}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
              {summary?.unmarked ?? 0} session(s) without a mark
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
              Excused
            </p>
            <p className="text-xl sm:text-3xl font-heading font-black text-teal-600 mt-2">
              {summary?.excused ?? 0}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
              Leave and excused marks
            </p>
          </div>
        </div>

        {summary ? (
          <section className="bg-amber-50 border border-amber-300 rounded-2xl sm:rounded-3xl p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-heading font-bold text-sm text-amber-900">
                  How this number is calculated
                </h2>
                <ul className="mt-2 space-y-1 text-xs sm:text-sm text-amber-900/90">
                  {summary.explanation.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {!summary.thresholdConfirmed ? (
                  <p className="mt-3 text-xs sm:text-sm font-semibold text-amber-900">
                    The unit has not confirmed an official attendance threshold
                    yet. This percentage is informational and is not an
                    eligibility decision.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {openSessions.length > 0 ? (
          <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <QrCode className="w-5 h-5 text-ncc-red" />
              <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg">
                Sessions open for check-in
              </h2>
            </div>

            <ul className="space-y-3">
              {openSessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 rounded-2xl border border-gray-200"
                >
                  <div>
                    <p className="font-semibold text-sm text-gray-900">
                      {session.title}
                    </p>
                    <p className="text-[11px] sm:text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatCalendarDate(session.date)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {session.startsAt
                          ? formatIstTime(session.startsAt)
                          : "No fixed time"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {session.venue || "No venue"}
                      </span>
                    </p>
                  </div>

                  <Link
                    href="/attendance/check-in"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light text-white text-xs font-bold touch-target"
                  >
                    <QrCode className="w-4 h-4" /> Check in
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-ncc-dark-blue" />
            <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg">
              Upcoming sessions
            </h2>
          </div>

          {upcomingSessions.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-2xl">
              <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-700">
                No session is scheduled yet
              </p>
              <p className="text-xs text-gray-400 mt-1">
                The officers publish the next activities of the unit here.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {upcomingSessions.map((session) => (
                <li
                  key={session.id}
                  className="p-3 sm:p-4 rounded-2xl border border-gray-200"
                >
                  <p className="font-semibold text-sm text-gray-900">
                    {session.title}
                  </p>
                  <p className="text-[11px] sm:text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatCalendarDate(session.date)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {session.startsAt
                        ? formatIstTime(session.startsAt)
                        : "No fixed time"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {session.venue || "No venue"}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg">
              Session history
            </h2>
            <span className="text-[10px] sm:text-xs font-bold text-ncc-dark-blue px-2.5 py-1 bg-ncc-light-blue/15 rounded-full">
              {records.length} records
            </span>
          </div>

          {records.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-2xl">
              <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-700">
                No session attendance recorded yet
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Once the officers mark the roll, your record appears here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-2 px-2">Session</th>
                    <th className="py-2 px-2">Type</th>
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2">Marked via</th>
                    <th className="py-2 px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50/70">
                      <td className="py-2.5 px-2 font-medium text-gray-900">
                        {record.session.title}
                      </td>
                      <td className="py-2.5 px-2 text-gray-600">
                        {record.session.type.replace(/_/g, " ")}
                      </td>
                      <td className="py-2.5 px-2 text-gray-500">
                        {formatCalendarDate(record.session.date)}
                      </td>
                      <td className="py-2.5 px-2 text-gray-500">
                        {record.method === "QR" ? "QR check-in" : "Officer"}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            MARK_CLASS[record.status] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {record.status.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-[11px] text-gray-500 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            If a mark looks wrong, report it to your unit officer. A correction
            is only made by the staff and stays in the audit history.
          </p>
        </section>

        <p className="text-[11px] text-gray-500 flex items-start gap-2">
          <XCircle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          A leave request does not change your attendance by itself. An officer
          marks the session as excused after the leave is approved.
        </p>
      </div>
    </div>
  );
}
