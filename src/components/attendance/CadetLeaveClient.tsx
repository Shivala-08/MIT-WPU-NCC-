"use client";

import { formatCalendarDate } from "@/lib/calendar-date.mjs";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

const LEAVE_TYPES = ["MEDICAL", "PERSONAL", "ACADEMIC", "OTHER"];

type LeaveRequest = {
  id: string;
  type: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  reviewReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-200 text-gray-700",
};

const formatDate = formatCalendarDate;

export default function CadetLeaveClient({ today }: { today: string }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [form, setForm] = useState({
    type: "MEDICAL",
    startDate: today,
    endDate: today,
    reason: "",
  });

  const showNotice = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/leave");

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "The leave requests could not be loaded");
      }

      const payload = await response.json();

      setRequests(payload.requests ?? []);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "The leave requests could not be loaded"
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "The leave request could not be sent");
      }

      showNotice("success", "The leave request was sent for review.");
      setForm((current) => ({ ...current, reason: "" }));
      await load();
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error
          ? error.message
          : "The leave request could not be sent"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm("Cancel this leave request?")) {
      return;
    }

    try {
      const response = await fetch(`/api/leave/${id}/cancel`, {
        method: "POST",
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "The leave request could not be cancelled");
      }

      showNotice("success", "The leave request was cancelled.");
      await load();
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error
          ? error.message
          : "The leave request could not be cancelled"
      );
    }
  };

  return (
    <div className="py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8">
        <header className="bg-ncc-dark-blue text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <h1 className="font-heading font-black text-xl sm:text-2xl">
            Leave requests
          </h1>
          <p className="text-white/70 text-xs sm:text-sm mt-2">
            Ask for a leave and follow the decision of the unit. An approved
            leave does not change your attendance by itself: an officer marks
            the session as excused.
          </p>
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
          <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm h-fit">
            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-ncc-red" />
              <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg">
                New request
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="leave-type"
                  className="block text-xs font-bold text-gray-600 mb-1"
                >
                  Leave type
                </label>
                <select
                  id="leave-type"
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, type: event.target.value }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                >
                  {LEAVE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0) + type.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="leave-start"
                    className="block text-xs font-bold text-gray-600 mb-1"
                  >
                    From
                  </label>
                  <input
                    id="leave-start"
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                    required
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                  />
                </div>
                <div>
                  <label
                    htmlFor="leave-end"
                    className="block text-xs font-bold text-gray-600 mb-1"
                  >
                    To
                  </label>
                  <input
                    id="leave-end"
                    type="date"
                    value={form.endDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endDate: event.target.value,
                      }))
                    }
                    required
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="leave-reason"
                  className="block text-xs font-bold text-gray-600 mb-1"
                >
                  Reason
                </label>
                <textarea
                  id="leave-reason"
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  required
                  minLength={5}
                  maxLength={500}
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-ncc-red hover:bg-ncc-red-light text-white text-sm font-bold disabled:opacity-60 touch-target"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                Send the request
              </button>
            </form>
          </section>

          <section className="lg:col-span-2 bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg">
                My requests
              </h2>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading the requests
              </div>
            ) : loadError ? (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-300 text-sm text-red-900">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <p>{loadError}</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-700">
                  You have no leave request yet
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Use the form to send a request to the unit.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {requests.map((request) => (
                  <li
                    key={request.id}
                    className="p-3 sm:p-4 rounded-2xl border border-gray-200"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">
                          {request.type.charAt(0) + request.type.slice(1).toLowerCase()}{" "}
                          leave
                        </p>
                        <p className="text-[11px] sm:text-xs text-gray-500 mt-1">
                          {formatDate(request.startDate)} to {formatDate(request.endDate)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            STATUS_CLASS[request.status] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {request.status}
                        </span>

                        {request.status === "PENDING" ? (
                          <button
                            type="button"
                            onClick={() => void handleCancel(request.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Cancel
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-gray-600 mt-2">
                      {request.reason}
                    </p>

                    {request.reviewReason ? (
                      <p className="text-xs text-gray-700 mt-2 bg-gray-50 rounded-xl px-3 py-2">
                        Decision: {request.reviewReason}
                      </p>
                    ) : null}

                    <Link
                      href={`/leave/${request.id}`}
                      className="inline-block mt-2 text-[11px] font-semibold text-ncc-dark-blue underline"
                    >
                      See the full request
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-[11px] text-gray-500 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              Every decision keeps the reviewer, the time and the reason.
            </p>

            <p className="mt-2 text-[11px] text-gray-500 flex items-start gap-2">
              <XCircle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              Only a pending request can be cancelled. A decided request stays in
              the history.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
