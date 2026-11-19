"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * The error boundary of the attendance screens.
 *
 * A failing database read never shows a blank page. The error is reported and
 * the screen can be loaded again.
 */
export default function AttendanceError({
  error,
  reset,
  backHref,
  backLabel = "Back",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    console.error("The attendance screen failed:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-red-50 border border-red-300 rounded-2xl sm:rounded-3xl p-6">
        <div className="flex items-start gap-3 text-red-900">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">This screen could not be loaded</p>
            <p className="text-sm mt-1">
              The request failed. Nothing was changed. Try again, and tell an
              administrator if the problem stays.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light text-white text-xs font-bold touch-target"
              >
                <RefreshCw className="w-4 h-4" /> Try again
              </button>

              {backHref ? (
                <Link
                  href={backHref}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold touch-target"
                >
                  {backLabel}
                </Link>
              ) : null}
            </div>

            {error.digest ? (
              <p className="mt-4 text-[11px] text-red-700/70 font-mono">
                Reference: {error.digest}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
