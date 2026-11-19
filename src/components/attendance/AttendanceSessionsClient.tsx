"use client";

import { formatCalendarDate } from "@/lib/calendar-date.mjs";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Plus,
  Loader2,
  RefreshCw,
  Search,
  MapPin,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const ACTIVITY_TYPES = [
  "PARADE",
  "PHYSICAL_TRAINING",
  "DRILL",
  "TRAINING",
  "CAMP",
  "EVENT",
  "OTHER",
];

const SESSION_STATUSES = ["DRAFT", "OPEN", "CLOSED", "CANCELLED"];

type SessionRow = {
  id: string;
  title: string;
  type: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  description: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
};

export function sessionStatusClass(status: string) {
  switch (status) {
    case "OPEN":
      return "bg-emerald-100 text-emerald-800";
    case "CLOSED":
      return "bg-slate-200 text-slate-800";
    case "CANCELLED":
      return "bg-red-100 text-red-700";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

const formatDate = formatCalendarDate;

export default function AttendanceSessionsClient({
  role,
  basePath,
  today,
}: {
  role: "ADMIN" | "OFFICER";
  basePath: string;
  today: string;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [form, setForm] = useState({
    title: "",
    activityType: "PARADE",
    date: today,
    startTime: "06:30",
    endTime: "09:30",
    venue: "",
    description: "",
  });

  const showNotice = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams();

      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }

      if (fromDate) {
        params.set("from", fromDate);
      }

      if (toDate) {
        params.set("to", toDate);
      }

      const response = await fetch(
        `/api/admin/attendance/sessions?${params.toString()}`
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "The sessions could not be loaded");
      }

      const payload = await response.json();

      setSessions(payload.sessions ?? []);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "The sessions could not be loaded"
      );
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, fromDate, toDate]);

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

  const canCreate = useMemo(() => {
    return role === "ADMIN" || role === "OFFICER";
  }, [role]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/attendance/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "The session could not be created");
      }

      showNotice("success", "The session was created as a draft.");
      setForm((current) => ({ ...current, title: "", venue: "", description: "" }));
      await load();
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error ? error.message : "The session could not be created"
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="bg-ncc-dark-blue text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/10 border-2 border-ncc-gold flex items-center justify-center text-ncc-gold">
                <Calendar className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div>
                <h1 className="font-heading font-black text-xl sm:text-2xl">
                  Attendance Sessions
                </h1>
                <p className="text-white/70 text-xs sm:text-sm mt-1">
                  Create, open and close the sessions of the unit.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs sm:text-sm font-semibold touch-target"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {canCreate ? (
            <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm h-fit">
              <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg mb-4">
                New session
              </h2>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label
                    htmlFor="session-title"
                    className="block text-xs font-bold text-gray-600 mb-1"
                  >
                    Title
                  </label>
                  <input
                    id="session-title"
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder="Morning parade"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                  />
                </div>

                <div>
                  <label
                    htmlFor="session-type"
                    className="block text-xs font-bold text-gray-600 mb-1"
                  >
                    Activity type
                  </label>
                  <select
                    id="session-type"
                    value={form.activityType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        activityType: event.target.value,
                      }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                  >
                    {ACTIVITY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="session-date"
                      className="block text-xs font-bold text-gray-600 mb-1"
                    >
                      Date
                    </label>
                    <input
                      id="session-date"
                      type="date"
                      value={form.date}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          date: event.target.value,
                        }))
                      }
                      required
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="session-start"
                      className="block text-xs font-bold text-gray-600 mb-1"
                    >
                      Start
                    </label>
                    <input
                      id="session-start"
                      type="time"
                      value={form.startTime}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          startTime: event.target.value,
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="session-end"
                      className="block text-xs font-bold text-gray-600 mb-1"
                    >
                      End
                    </label>
                    <input
                      id="session-end"
                      type="time"
                      value={form.endTime}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          endTime: event.target.value,
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="session-venue"
                    className="block text-xs font-bold text-gray-600 mb-1"
                  >
                    Venue
                  </label>
                  <input
                    id="session-venue"
                    value={form.venue}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        venue: event.target.value,
                      }))
                    }
                    maxLength={120}
                    placeholder="Main ground"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                  />
                </div>

                <div>
                  <label
                    htmlFor="session-description"
                    className="block text-xs font-bold text-gray-600 mb-1"
                  >
                    Description
                  </label>
                  <textarea
                    id="session-description"
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    maxLength={500}
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-ncc-red hover:bg-ncc-red-light text-white text-sm font-bold disabled:opacity-60 touch-target"
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Create draft session
                </button>
              </form>
            </section>
          ) : null}

          <section className="lg:col-span-2 bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg">
                Session list
              </h2>

              <div className="flex flex-col sm:flex-row gap-2">
                <label htmlFor="session-status-filter" className="sr-only">
                  Filter by status
                </label>
                <select
                  id="session-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                >
                  <option value="ALL">All statuses</option>
                  {SESSION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>

                <label htmlFor="session-from" className="sr-only">
                  From date
                </label>
                <input
                  id="session-from"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                />

                <label htmlFor="session-to" className="sr-only">
                  To date
                </label>
                <input
                  id="session-to"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading the sessions
              </div>
            ) : loadError ? (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-300 text-sm text-red-900">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-bold">The sessions could not be loaded</p>
                  <p className="mt-1">{loadError}</p>
                </div>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-700">
                  No session matches this filter
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Create a draft session to start a new attendance record.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`${basePath}/sessions/${session.id}`}
                      className="flex items-center justify-between gap-3 py-3.5 hover:bg-gray-50 rounded-xl px-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">
                          {session.title}
                        </p>
                        <p className="text-[11px] sm:text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>{formatDate(session.date)}</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {session.venue || "No venue"}
                          </span>
                          <span>
                            {session.startTime && session.endTime
                              ? `${session.startTime} - ${session.endTime}`
                              : "No fixed time"}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${sessionStatusClass(
                            session.status
                          )}`}
                        >
                          {session.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-[11px] text-gray-500 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              A session has to be open before the roll can be marked. A closed
              session is read only for officers.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
