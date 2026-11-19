import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { readLeave, serializeLeave } from "@/lib/leave-service.mjs";

export const metadata: Metadata = {
  title: "Leave Request | NCC MIT WPU",
  description: "The details of one leave request.",
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-200 text-gray-700",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function LeaveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!isApprovedAccount(user)) {
    redirect("/pending");
  }

  if (user.role !== "CADET") {
    redirect("/dashboard");
  }

  const { id } = await params;
  const request = await readLeave(prisma, { id });

  if (!request || request.userId !== user.id) {
    redirect("/leave");
  }

  const leave = serializeLeave(request);

  if (!leave) {
    notFound();
  }

  return (
    <div className="py-6 sm:py-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6">
        <header className="bg-ncc-dark-blue text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <Link href="/leave" className="text-[11px] sm:text-xs text-white/60">
            Back to my requests
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-2">
            <h1 className="font-heading font-black text-xl sm:text-2xl">
              Leave request
            </h1>
            <span
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${
                STATUS_CLASS[leave.status] ?? "bg-white/20 text-white"
              }`}
            >
              {leave.status}
            </span>
          </div>
        </header>

        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Type
              </p>
              <p className="font-semibold text-gray-900 mt-1">{leave.type}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Dates
              </p>
              <p className="font-semibold text-gray-900 mt-1">
                {formatDate(leave.startDate)} to {formatDate(leave.endDate)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Sent on
              </p>
              <p className="font-semibold text-gray-900 mt-1">
                {formatDate(leave.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Decided by
              </p>
              <p className="font-semibold text-gray-900 mt-1">
                {leave.reviewer?.name ?? "Not decided yet"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Reason
            </p>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">
              {leave.reason}
            </p>
          </div>

          {leave.reviewReason ? (
            <div className="bg-gray-50 rounded-2xl p-3 sm:p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Decision note
              </p>
              <p className="text-sm text-gray-700 mt-1">{leave.reviewReason}</p>
              {leave.reviewedAt ? (
                <p className="text-[11px] text-gray-500 mt-1">
                  {formatDate(leave.reviewedAt)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
