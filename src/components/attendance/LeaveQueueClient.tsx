"use client";

import { formatCalendarDate } from "@/lib/calendar-date.mjs";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

type LeaveRow = {
  id: string;
  type: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  reviewReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  cadet: {
    id: string;
    name: string;
    fullName: string;
    prn: string | null;
    regiNumber: string | null;
    wing: string | null;
    division: string | null;
    year: string | null;
    branch: string | null;
  } | null;
  reviewer: { id: string; name: string } | null;
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-200 text-gray-700",
};

const formatDate = formatCalendarDate;

export default function LeaveQueueClient({
  role,
  basePath,
}: {
  role: "ADMIN" | "OFFICER";
  basePath: string;
}) {
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{
    id: string;
    decision: "APPROVED" | "REJECTED";
    cadetName: string;
  } | null>(null);

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

      const response = await fetch(`/api/admin/leave?${params.toString()}`);

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
  }, [statusFilter]);

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

  const decide = async (
    id: string,
    decision: "APPROVED" | "REJECTED",
    reason: string
  ) => {
    setBusyId(id);

    try {
      const response = await fetch(`/api/admin/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "The leave request could not be decided");
      }

      showNotice(
        "success",
        decision === "APPROVED"
          ? "The leave request was approved."
          : "The leave request was rejected."
      );
      await load();
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error
          ? error.message
          : "The leave request could not be decided"
      );
    } finally {
      setBusyId(null);
    }
  };

  const canDecide = role === "ADMIN";

  return (
    <div className="min-h-screen bg-gray-100 py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="bg-ncc-dark-blue text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-heading font-black text-xl sm:text-2xl">
                Leave management
              </h1>
              <p className="text-white/70 text-xs sm:text-sm mt-2">
                {canDecide
                  ? "Review the requests of the unit and record the decision."
                  : "Read only view of the leave requests of the unit."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="leave-status-filter" className="sr-only">
                Filter by status
              </label>
              <select
                id="leave-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
              >
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="ALL">All</option>
              </select>

              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
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
              <CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-700">
                No request matches this filter
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="p-3 sm:p-5 rounded-2xl border border-gray-200"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">
                        {request.cadet?.fullName ?? request.cadet?.name ?? "Cadet"}
                      </p>
                      <p className="text-[11px] sm:text-xs text-gray-500 mt-1">
                        {request.cadet?.wing || "-"} wing •{" "}
                        {request.cadet?.division || "-"} •{" "}
                        {request.cadet?.prn || request.cadet?.regiNumber || "-"}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold h-fit ${
                        STATUS_CLASS[request.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {request.status}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-gray-700 mt-3">
                    <span className="font-bold">{request.type}</span> from{" "}
                    {formatDate(request.startDate)} to {formatDate(request.endDate)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    {request.reason}
                  </p>

                  {request.reviewReason ? (
                    <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-xl px-3 py-2">
                      {request.reviewer?.name ?? "A reviewer"}:{" "}
                      {request.reviewReason}
                    </p>
                  ) : null}

                  {canDecide && request.status === "PENDING" ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === request.id}
                          onClick={() =>
                            setPendingDecision({
                              id: request.id,
                              decision: "APPROVED",
                              cadetName:
                                request.cadet?.fullName ?? request.cadet?.name ?? "the cadet",
                            })
                          }
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 touch-target"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === request.id}
                          onClick={() =>
                            setPendingDecision({
                              id: request.id,
                              decision: "REJECTED",
                              cadetName:
                                request.cadet?.fullName ?? request.cadet?.name ?? "the cadet",
                            })
                          }
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50 touch-target"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <Link
                    href={`${basePath}/${request.id}`}
                    className="inline-block mt-3 text-[11px] font-semibold text-ncc-dark-blue underline"
                  >
                    See the full request
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 text-[11px] text-gray-500">
            Approving a leave does not rewrite the attendance. An officer marks
            the session as excused, and that action is written to the audit
            history.
          </p>
        </section>
      </div>

      {pendingDecision ? (
        <ConfirmDialog
          open
          tone={pendingDecision.decision === "REJECTED" ? "danger" : "default"}
          title={
            pendingDecision.decision === "APPROVED"
              ? "Approve this leave request?"
              : "Reject this leave request?"
          }
          description={
            pendingDecision.decision === "APPROVED"
              ? `${pendingDecision.cadetName} is granted the leave. The decision is stored in the audit history.`
              : `${pendingDecision.cadetName} is not granted the leave. The decision is stored in the audit history.`
          }
          confirmLabel={
            pendingDecision.decision === "APPROVED"
              ? "Approve the request"
              : "Reject the request"
          }
          reason={{
            label:
              pendingDecision.decision === "APPROVED"
                ? "Decision note (optional)"
                : "Why is the request rejected?",
            placeholder: "Written note for the cadet",
            minLength: 5,
            required: pendingDecision.decision === "REJECTED",
            helper:
              pendingDecision.decision === "APPROVED"
                ? "The note is stored in the audit history."
                : "A rejection needs a reason of at least 5 characters.",
          }}
          onCancel={() => setPendingDecision(null)}
          onConfirm={(reason) => {
            const decision = pendingDecision;
            setPendingDecision(null);
            void decide(decision.id, decision.decision, reason);
          }}
        />
      ) : null}
    </div>
  );
}
