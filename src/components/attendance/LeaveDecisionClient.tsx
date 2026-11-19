"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export default function LeaveDecisionClient({
  leaveId,
  canDecide,
}: {
  leaveId: string;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "APPROVED" | "REJECTED") => {
    if (decision === "REJECTED" && reason.trim().length < 5) {
      setError("A rejection needs a reason of at least 5 characters.");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/leave/${leaveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "The request could not be decided");
      }

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The request could not be decided"
      );
    } finally {
      setIsBusy(false);
    }
  };

  if (!canDecide) {
    return (
      <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-3">
        Only an administrator can decide a leave request.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="decision-reason"
          className="block text-xs font-bold text-gray-600 mb-1"
        >
          Decision note (required for a rejection)
        </label>
        <input
          id="decision-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void decide("APPROVED")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 touch-target"
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          Approve
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void decide("REJECTED")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50 touch-target"
        >
          <XCircle className="w-4 h-4" /> Reject
        </button>
      </div>
    </div>
  );
}
