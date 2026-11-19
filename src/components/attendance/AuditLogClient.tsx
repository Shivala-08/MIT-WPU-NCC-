"use client";

import { formatIstDateTime } from "@/lib/calendar-date.mjs";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  ScrollText,
} from "lucide-react";

type AuditEvent = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
  summary: string;
  actor: { id: string; name: string; role: string | null } | null;
};

const ENTITY_CLASS: Record<string, string> = {
  AttendanceSession: "bg-ncc-light-blue/15 text-ncc-dark-blue",
  Attendance: "bg-emerald-100 text-emerald-800",
  AttendanceQrToken: "bg-purple-100 text-purple-800",
  AttendanceManualCode: "bg-purple-100 text-purple-800",
  LeaveRequest: "bg-amber-100 text-amber-800",
  AttendancePolicy: "bg-gray-200 text-gray-700",
  User: "bg-sky-100 text-sky-800",
};

const PAGE_SIZE = 25;

function formatDateTime(value: string) {
  return formatIstDateTime(value, "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function AuditLogClient() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams();

      if (entityFilter !== "ALL") {
        params.set("entity", entityFilter);
      }

      if (actionFilter !== "ALL") {
        params.set("action", actionFilter);
      }

      if (from) {
        params.set("from", from);
      }

      if (to) {
        params.set("to", to);
      }

      params.set("take", String(PAGE_SIZE));
      params.set("skip", String(page * PAGE_SIZE));

      const response = await fetch(`/api/admin/attendance/audit?${params.toString()}`);

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "The audit history could not be loaded");
      }

      const payload = await response.json();

      setEvents(payload.events ?? []);
      setTotal(payload.total ?? 0);
      setEntities(payload.entities ?? []);
      setActions(payload.actions ?? []);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "The audit history could not be loaded"
      );
    } finally {
      setIsLoading(false);
    }
  }, [actionFilter, entityFilter, from, page, to]);

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

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="min-h-screen bg-gray-100 py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="bg-ncc-dark-blue text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-heading font-black text-xl sm:text-2xl">
                Audit history
              </h1>
              <p className="text-white/70 text-xs sm:text-sm mt-2">
                Every change to a session, a mark, a leave request or the
                attendance policy.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold self-start"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </header>

        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label
                htmlFor="audit-entity"
                className="block text-xs font-bold text-gray-600 mb-1"
              >
                Record
              </label>
              <select
                id="audit-entity"
                value={entityFilter}
                onChange={(event) => {
                  setEntityFilter(event.target.value);
                  setPage(0);
                }}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
              >
                <option value="ALL">All records</option>
                {entities.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="audit-action"
                className="block text-xs font-bold text-gray-600 mb-1"
              >
                Action
              </label>
              <select
                id="audit-action"
                value={actionFilter}
                onChange={(event) => {
                  setActionFilter(event.target.value);
                  setPage(0);
                }}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
              >
                <option value="ALL">All actions</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action.replace(/_/g, " ").toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="audit-from"
                className="block text-xs font-bold text-gray-600 mb-1"
              >
                From
              </label>
              <input
                id="audit-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(0);
                }}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
              />
            </div>

            <div>
              <label
                htmlFor="audit-to"
                className="block text-xs font-bold text-gray-600 mb-1"
              >
                To
              </label>
              <input
                id="audit-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(0);
                }}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
              />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading the audit
              history
            </div>
          ) : loadError ? (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-300 text-sm text-red-900">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <p>{loadError}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-2 inline-flex items-center gap-2 text-xs font-semibold underline"
                >
                  <RefreshCw className="w-4 h-4" /> Try again
                </button>
              </div>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
              <ScrollText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-700">
                No event matches this filter
              </p>
              <p className="text-xs text-gray-400 mt-1">
                The trail records every session, mark, leave and policy change.
              </p>
            </div>
          ) : (
            <ol className="space-y-3">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="p-3 sm:p-4 rounded-2xl border border-gray-200"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {event.summary}
                    </p>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold h-fit ${
                        ENTITY_CLASS[event.entity] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {event.entity.replace(/([a-z])([A-Z])/g, "$1 $2")}
                    </span>
                  </div>

                  <p className="text-[11px] sm:text-xs text-gray-500 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" />
                      {event.actor?.name ?? "The system"}
                      {event.actor?.role ? ` (${event.actor.role})` : ""}
                    </span>
                    <span>{formatDateTime(event.createdAt)}</span>
                    {event.entityId ? (
                      <span className="font-mono text-[10px] text-gray-400">
                        {event.entityId}
                      </span>
                    ) : null}
                  </p>

                  {isRecord(event.oldData) || isRecord(event.newData) ? (
                    <details className="mt-2">
                      <summary className="text-[11px] font-semibold text-ncc-dark-blue cursor-pointer">
                        Show the change
                      </summary>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-gray-50 rounded-xl p-2.5">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Before
                          </p>
                          <pre className="text-[10px] text-gray-600 mt-1 whitespace-pre-wrap break-words">
                            {JSON.stringify(event.oldData, null, 2)}
                          </pre>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-2.5">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            After
                          </p>
                          <pre className="text-[10px] text-gray-600 mt-1 whitespace-pre-wrap break-words">
                            {JSON.stringify(event.newData, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="text-[11px] text-gray-500">
              {total} event{total === 1 ? "" : "s"}
              {totalPages > 1 ? ` • Page ${page + 1} of ${totalPages}` : ""}
            </p>

            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(current - 1, 0))}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold disabled:opacity-40 touch-target"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold disabled:opacity-40 touch-target"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
