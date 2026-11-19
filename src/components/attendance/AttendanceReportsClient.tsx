"use client";

import { formatCalendarDate } from "@/lib/calendar-date.mjs";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Download,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

type CadetRow = {
  userId: string;
  name: string;
  fullName: string;
  prn: string | null;
  wing: string | null;
  division: string | null;
  eligibleSessions: number;
  attended: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
  percentage: number;
};

type SessionRow = {
  sessionId: string;
  title: string | null;
  type: string | null;
  date: string | null;
  marked: number;
  attended: number;
  percentage: number;
};

type GroupRow = {
  group: string;
  cadets?: number;
  sessions?: number;
  marked?: number;
  attended?: number;
  percentage: number;
};

type ReportPayload = {
  totals: {
    sessions: number;
    cadets: number;
    eligibleSessions: number;
    attended: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    percentage: number;
  };
  byWing: GroupRow[];
  byDivision: GroupRow[];
  byActivity: GroupRow[];
  cadets: CadetRow[];
  sessions: SessionRow[];
  policy: {
    version: number;
    thresholdPercent: number;
    thresholdConfirmed: boolean;
    lateCountsAsPresent: boolean;
    excusedExcludedFromDenominator: boolean;
    activityTypes: string[];
    notes: string | null;
  };
};

// The activity types of the unit. The same list is used by the session form
// and by the allow list of the server.
const ACTIVITY_TYPES = [
  "PARADE",
  "PHYSICAL_TRAINING",
  "DRILL",
  "TRAINING",
  "CAMP",
  "EVENT",
  "OTHER",
];

export default function AttendanceReportsClient({
  role,
}: {
  role: "ADMIN" | "OFFICER";
}) {
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [wing, setWing] = useState("");
  const [division, setDivision] = useState("");
  const [type, setType] = useState("");
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    thresholdPercent: 75,
    thresholdConfirmed: false,
    lateCountsAsPresent: false,
    excusedExcludedFromDenominator: true,
    activityTypes: [] as string[],
  });
  const [isPolicyConfirmOpen, setIsPolicyConfirmOpen] = useState(false);

  const showNotice = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();

    if (appliedSearch) {
      params.set("search", appliedSearch);
    }

    if (fromDate) {
      params.set("from", fromDate);
    }

    if (toDate) {
      params.set("to", toDate);
    }

    if (wing) {
      params.set("wing", wing);
    }

    if (division) {
      params.set("division", division);
    }

    if (type) {
      params.set("type", type);
    }

    return params;
  }, [appliedSearch, fromDate, toDate, wing, division, type]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(
        `/api/admin/attendance/reports?${buildParams().toString()}`
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "The report could not be built");
      }

      const payload = await response.json();

      setReport(payload);
      setPolicyForm({
        thresholdPercent: payload.policy.thresholdPercent,
        thresholdConfirmed: payload.policy.thresholdConfirmed,
        lateCountsAsPresent: payload.policy.lateCountsAsPresent,
        excusedExcludedFromDenominator:
          payload.policy.excusedExcludedFromDenominator,
        activityTypes: payload.policy.activityTypes ?? [],
      });
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "The report could not be built"
      );
    } finally {
      setIsLoading(false);
    }
  }, [buildParams]);

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

  const handleExport = async () => {
    try {
      const response = await fetch(
        `/api/admin/attendance/export?${buildParams().toString()}`
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "The export could not be created");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `ncc-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      showNotice("success", "The export was downloaded and written to the audit history.");
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error ? error.message : "The export could not be created"
      );
    }
  };

  const handleSavePolicy = async () => {
    setIsSavingPolicy(true);

    try {
      const response = await fetch("/api/admin/attendance/policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policyForm),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "The policy could not be saved");
      }

      showNotice("success", "The attendance policy was saved.");
      await load();
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error ? error.message : "The policy could not be saved"
      );
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const canExport = role === "ADMIN";
  const canEditPolicy = role === "ADMIN";

  return (
    <div className="min-h-screen bg-gray-100 py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="bg-ncc-dark-blue text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/10 border-2 border-ncc-gold flex items-center justify-center text-ncc-gold">
                <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div>
                <h1 className="font-heading font-black text-xl sm:text-2xl">
                  Attendance reports
                </h1>
                <p className="text-white/70 text-xs sm:text-sm mt-1">
                  The attendance of the unit with the calculation rules of the
                  current policy.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold touch-target"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>

              {canExport ? (
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light text-white text-xs font-bold touch-target"
                >
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {notice ? (
          <div
            role="status"
            className={`p-3 sm:p-4 rounded-2xl border text-xs sm:text-sm ${
              notice.kind === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : "bg-red-50 border-red-300 text-red-900"
            }`}
          >
            {notice.text}
          </div>
        ) : null}

        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedSearch(search.trim());
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
          >
            <div className="lg:col-span-2">
              <label
                htmlFor="report-search"
                className="block text-xs font-bold text-gray-600 mb-1"
              >
                Search
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="report-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, PRN or regt no"
                  className="pl-9 pr-3 py-2.5 w-full rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="report-from"
                className="block text-xs font-bold text-gray-600 mb-1"
              >
                From
              </label>
              <input
                id="report-from"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
              />
            </div>

            <div>
              <label
                htmlFor="report-to"
                className="block text-xs font-bold text-gray-600 mb-1"
              >
                To
              </label>
              <input
                id="report-to"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
              />
            </div>

            <div>
              <label
                htmlFor="report-wing"
                className="block text-xs font-bold text-gray-600 mb-1"
              >
                Wing
              </label>
              <input
                id="report-wing"
                value={wing}
                onChange={(event) => setWing(event.target.value)}
                placeholder="Army"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
              />
            </div>

            <div>
              <label
                htmlFor="report-division"
                className="block text-xs font-bold text-gray-600 mb-1"
              >
                Division
              </label>
              <input
                id="report-division"
                value={division}
                onChange={(event) => setDivision(event.target.value)}
                placeholder="A"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
              />
            </div>

            <div>
              <label
                htmlFor="report-type"
                className="block text-xs font-bold text-gray-600 mb-1"
              >
                Activity
              </label>
              <select
                id="report-type"
                value={type}
                onChange={(event) => setType(event.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
              >
                <option value="">Every activity</option>
                {ACTIVITY_TYPES.map((activityType) => (
                  <option key={activityType} value={activityType}>
                    {activityType.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <button
                type="submit"
                className="w-full px-4 py-2.5 rounded-xl bg-ncc-dark-blue hover:bg-ncc-light-blue text-white text-xs font-bold touch-target"
              >
                Apply filters
              </button>
            </div>
          </form>

          {division || type ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
              {division ? <span>Division: {division}</span> : null}
              {type ? <span>Activity: {type}</span> : null}
              <button
                type="button"
                onClick={() => {
                  setDivision("");
                  setType("");
                  setAppliedSearch(search.trim());
                }}
                className="font-semibold text-ncc-dark-blue underline"
              >
                Clear the division and activity filter
              </button>
            </div>
          ) : null}
        </section>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" /> Building the report
          </div>
        ) : loadError ? (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-300 text-sm text-red-900">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>{loadError}</p>
          </div>
        ) : report ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Unit attendance
                </p>
                <p className="text-xl sm:text-3xl font-heading font-black text-ncc-dark-blue mt-2">
                  {report.totals.percentage}%
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                  {report.totals.attended} attended of{" "}
                  {report.totals.eligibleSessions} eligible
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Sessions
                </p>
                <p className="text-xl sm:text-3xl font-heading font-black text-gray-900 mt-2">
                  {report.totals.sessions}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                  In the selected period
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Cadets
                </p>
                <p className="text-xl sm:text-3xl font-heading font-black text-gray-900 mt-2">
                  {report.totals.cadets}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                  Approved accounts
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Policy
                </p>
                <p className="text-xl sm:text-3xl font-heading font-black text-gray-900 mt-2">
                  v{report.policy.version}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                  {report.policy.thresholdConfirmed
                    ? `Threshold ${report.policy.thresholdPercent}% confirmed`
                    : "Threshold not confirmed"}
                </p>
              </div>
            </div>

            {!report.policy.thresholdConfirmed ? (
              <div className="flex items-start gap-3 p-3 sm:p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs sm:text-sm">
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                <p>
                  The unit has not confirmed an official attendance threshold.
                  The percentages are informational and are not an eligibility
                  decision.
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                <h2 className="font-heading font-bold text-gray-900 text-sm sm:text-base mb-3">
                  By wing
                </h2>
                <ul className="space-y-2 text-xs">
                  {report.byWing.map((row) => (
                    <li
                      key={row.group}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-gray-700">
                        {row.group}
                      </span>
                      <span className="text-gray-500">
                        {row.cadets} cadets • {row.percentage}%
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                <h2 className="font-heading font-bold text-gray-900 text-sm sm:text-base mb-3">
                  By division
                </h2>
                <ul className="space-y-2 text-xs">
                  {report.byDivision.map((row) => (
                    <li
                      key={row.group}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-gray-700">
                        {row.group}
                      </span>
                      <span className="text-gray-500">
                        {row.cadets} cadets • {row.percentage}%
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                <h2 className="font-heading font-bold text-gray-900 text-sm sm:text-base mb-3">
                  By activity
                </h2>
                <ul className="space-y-2 text-xs">
                  {report.byActivity.map((row) => (
                    <li
                      key={row.group}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-gray-700">
                        {row.group.replace(/_/g, " ")}
                      </span>
                      <span className="text-gray-500">
                        {row.sessions} sessions • {row.percentage}%
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
              <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg mb-3">
                Cadet wise
              </h2>

              {report.cadets.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-2xl">
                  <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-700">
                    No cadet matches these filters
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Clear the search or widen the date range.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className="border-b text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                        <th scope="col" className="py-2 px-2">
                          Cadet
                        </th>
                        <th scope="col" className="py-2 px-2">
                          Wing
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          Eligible
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          Present
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          Late
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          Absent
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          Excused
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          Rate
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.cadets.map((row) => (
                        <tr key={row.userId} className="hover:bg-gray-50/70">
                          <td className="py-2.5 px-2">
                            <p className="font-semibold text-gray-900">
                              {row.fullName}
                            </p>
                            <p className="text-[10px] text-gray-500">{row.prn ?? "-"}</p>
                          </td>
                          <td className="py-2.5 px-2 text-gray-600">
                            {row.wing ?? "-"}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {row.eligibleSessions}
                          </td>
                          <td className="py-2.5 px-2 text-right">{row.present}</td>
                          <td className="py-2.5 px-2 text-right">{row.late}</td>
                          <td className="py-2.5 px-2 text-right">{row.absent}</td>
                          <td className="py-2.5 px-2 text-right">{row.excused}</td>
                          <td className="py-2.5 px-2 text-right font-bold text-gray-900">
                            {row.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
              <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg mb-3">
                Session wise
              </h2>

              {report.sessions.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-2xl">
                  <Info className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-700">
                    No session matches these filters
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Cancelled sessions are never part of a report.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr className="border-b text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                        <th scope="col" className="py-2 px-2">
                          Session
                        </th>
                        <th scope="col" className="py-2 px-2">
                          Type
                        </th>
                        <th scope="col" className="py-2 px-2">
                          Date
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          Marked
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          Attended
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          Rate
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.sessions.map((row) => (
                        <tr key={row.sessionId} className="hover:bg-gray-50/70">
                          <td className="py-2.5 px-2 font-medium text-gray-900">
                            {row.title}
                          </td>
                          <td className="py-2.5 px-2 text-gray-600">
                            {(row.type ?? "").replace(/_/g, " ")}
                          </td>
                          <td className="py-2.5 px-2 text-gray-500">
                            {row.date
                              ? formatCalendarDate(row.date)
                              : "-"}
                          </td>
                          <td className="py-2.5 px-2 text-right">{row.marked}</td>
                          <td className="py-2.5 px-2 text-right">{row.attended}</td>
                          <td className="py-2.5 px-2 text-right font-bold text-gray-900">
                            {row.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {canEditPolicy ? (
              <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg mb-1">
                  Calculation policy
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  The policy decides how the percentage is calculated. Keep the
                  confirmation off until the institution confirms the rule.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="policy-threshold"
                      className="block text-xs font-bold text-gray-600 mb-1"
                    >
                      Threshold percentage
                    </label>
                    <input
                      id="policy-threshold"
                      type="number"
                      min={0}
                      max={100}
                      value={policyForm.thresholdPercent}
                      onChange={(event) =>
                        setPolicyForm((current) => ({
                          ...current,
                          thresholdPercent: Number(event.target.value),
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        checked={policyForm.thresholdConfirmed}
                        onChange={(event) =>
                          setPolicyForm((current) => ({
                            ...current,
                            thresholdConfirmed: event.target.checked,
                          }))
                        }
                        className="w-4 h-4"
                      />
                      The institution confirmed the threshold
                    </label>

                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        checked={policyForm.lateCountsAsPresent}
                        onChange={(event) =>
                          setPolicyForm((current) => ({
                            ...current,
                            lateCountsAsPresent: event.target.checked,
                          }))
                        }
                        className="w-4 h-4"
                      />
                      A late mark counts as attended
                    </label>

                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        checked={policyForm.excusedExcludedFromDenominator}
                        onChange={(event) =>
                          setPolicyForm((current) => ({
                            ...current,
                            excusedExcludedFromDenominator: event.target.checked,
                          }))
                        }
                        className="w-4 h-4"
                      />
                      An excused mark leaves the denominator
                    </label>
                  </div>
                </div>

                <fieldset className="mt-4">
                  <legend className="block text-xs font-bold text-gray-600 mb-1">
                    Activity types that count towards the percentage
                  </legend>
                  <p className="text-[11px] text-gray-500 mb-2">
                    Leave every box empty to count every activity of the unit.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ACTIVITY_TYPES.map((activityType) => {
                      const checked = policyForm.activityTypes.includes(
                        activityType
                      );

                      return (
                        <label
                          key={activityType}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                            checked
                              ? "bg-ncc-dark-blue text-white border-ncc-dark-blue"
                              : "bg-white text-gray-600 border-gray-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setPolicyForm((current) => ({
                                ...current,
                                activityTypes: event.target.checked
                                  ? [...current.activityTypes, activityType]
                                  : current.activityTypes.filter(
                                      (value) => value !== activityType
                                    ),
                              }))
                            }
                            className="w-3.5 h-3.5"
                          />
                          {activityType.replace(/_/g, " ")}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <button
                  type="button"
                  disabled={isSavingPolicy}
                  onClick={() => setIsPolicyConfirmOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-ncc-red hover:bg-ncc-red-light text-white text-sm font-bold disabled:opacity-50 touch-target"
                >
                  {isSavingPolicy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save the policy
                </button>

                <p className="mt-3 text-[11px] text-gray-500">
                  Every change of the policy is written to the audit history with
                  the previous values.
                </p>
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      {isPolicyConfirmOpen ? (
        <ConfirmDialog
          open
          title="Save the calculation policy?"
          description="The new rule applies to every report from now on. The previous values stay in the audit history."
          confirmLabel="Save the policy"
          onCancel={() => setIsPolicyConfirmOpen(false)}
          onConfirm={() => {
            setIsPolicyConfirmOpen(false);
            void handleSavePolicy();
          }}
        />
      ) : null}
    </div>
  );
}
