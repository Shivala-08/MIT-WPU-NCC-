"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Users,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Save,
  Shield,
  Mail,
  Lock,
  AlertTriangle,
} from "lucide-react";

type Completion = {
  completed: number;
  total: number;
  percent: number;
  missing: { field: string; label: string }[];
  optionalMissing: { field: string; label: string }[];
};

type CadetRow = {
  id: string;
  name: string;
  email: string;
  approvalStatus: string;
  /**
   * The moment the account was deactivated, or null while it is active.
   * A deactivated cadet is not deleted. Its history stays in the database.
   */
  deactivatedAt: string | Date | null;
  rosterMatched: boolean;
  rosterActive: boolean | null;
  rejectionReason: string | null;
  cadetProfile: {
    fullName: string;
    wing: string | null;
    division: string | null;
    year: string | null;
    branch: string | null;
    prn: string | null;
    regiNumber: string | null;
    phone: string | null;
    photoUrl: string | null;
  } | null;
  completion: Completion;
};

type Detail = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    approvalStatus: string;
    approvedAt: string | null;
    rejectionReason: string | null;
    deactivatedAt: string | Date | null;
    deactivatedById: string | null;
    deactivationReason: string | null;
  };
  roster: {
    id: string;
    email: string;
    fullName: string;
    prn: string | null;
    regiNumber: string | null;
    wing: string | null;
    division: string | null;
    year: string | null;
    branch: string | null;
    active: boolean;
  } | null;
  rosterMatched: boolean;
  profile: Record<string, unknown> | null;
  hasPhoto: boolean;
  correctionRequests: {
    id: string;
    createdAt: string;
    newData: { field?: string; value?: string; reason?: string } | null;
  }[];
  editableFields: { field: string; label: string; owner: string }[];
};

const PAGE_SIZE = 50;

const EDITABLE_DETAIL_FIELDS: { field: string; label: string; type?: string }[] = [
  { field: "fullName", label: "Full name" },
  { field: "prn", label: "PRN" },
  { field: "regiNumber", label: "Regimental number" },
  { field: "wing", label: "Wing" },
  { field: "division", label: "Division" },
  { field: "year", label: "Academic year" },
  { field: "branch", label: "Branch" },
  { field: "dob", label: "Date of birth", type: "date" },
  { field: "gender", label: "Gender" },
  { field: "bloodGroup", label: "Blood group" },
  { field: "phone", label: "Phone" },
  { field: "address", label: "Address" },
  { field: "parentContact", label: "Parent contact" },
  { field: "emergencyContact", label: "Emergency contact" },
];

function statusClass(status: string) {
  if (status === "APPROVED") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (status === "REJECTED") {
    return "bg-red-100 text-red-700";
  }

  return "bg-amber-100 text-amber-800";
}

export default function CadetDirectoryClient() {
  const [cadets, setCadets] = useState<CadetRow[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [rosterFilter, setRosterFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailValues, setDetailValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        status: statusFilter,
        roster: rosterFilter,
      });

      if (search.trim()) {
        params.set("q", search.trim());
      }

      const response = await fetch(`/api/admin/profiles?${params.toString()}`);

      if (!response.ok) {
        setNotice({ kind: "error", text: "The cadet list could not be loaded" });
        return;
      }

      const payload = await response.json();
      setCadets(payload.cadets ?? []);
      setTotal(payload.total ?? 0);
      setTotalPages(payload.totalPages ?? 1);
    } catch {
      setNotice({ kind: "error", text: "The cadet list could not be loaded" });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, rosterFilter]);

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

  const openDetail = async (userId: string) => {
    setSelectedId(userId);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/cadets/${userId}`);

      if (!response.ok) {
        setNotice({ kind: "error", text: "The cadet record could not be loaded" });
        return;
      }

      const payload: Detail = await response.json();
      setDetail(payload);

      const values: Record<string, string> = {};

      for (const field of EDITABLE_DETAIL_FIELDS) {
        const value = (payload.profile as Record<string, unknown> | null)?.[
          field.field
        ];

        if (value === null || value === undefined) {
          values[field.field] = "";
          continue;
        }

        const text = String(value);
        values[field.field] = /^\d{4}-\d{2}-\d{2}T/.test(text)
          ? text.slice(0, 10)
          : text;
      }

      setDetailValues(values);
    } catch {
      setNotice({ kind: "error", text: "The cadet record could not be loaded" });
    }
  };

  const saveDetail = async () => {
    if (!selectedId) {
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/cadets/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detailValues),
      });

      const payload = await response.json();

      if (!response.ok) {
        setNotice({
          kind: "error",
          text: payload.error ?? "The profile could not be saved",
        });
        return;
      }

      setNotice({ kind: "success", text: "The cadet profile has been updated" });
      await openDetail(selectedId);
      await load();
    } catch {
      setNotice({ kind: "error", text: "The profile could not be saved" });
    } finally {
      setIsSaving(false);
    }
  };

  const changeApproval = async (status: "APPROVED" | "REJECTED") => {
    if (!selectedId) {
      return;
    }

    const confirmed = window.confirm(
      status === "APPROVED"
        ? "Approve this account? The cadet can use the portal immediately."
        : "Reject this account? The cadet loses access to the portal."
    );

    if (!confirmed) {
      return;
    }

    setIsApproving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/cadets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedId, status }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setNotice({
          kind: "error",
          text: payload.error ?? "The approval state could not be changed",
        });
        return;
      }

      setNotice({ kind: "success", text: `The account is now ${status}` });
      await openDetail(selectedId);
      await load();
    } catch {
      setNotice({
        kind: "error",
        text: "The approval state could not be changed",
      });
    } finally {
      setIsApproving(false);
    }
  };

  /**
   * Deactivates or reactivates an account.
   *
   * The account is never deleted. The attendance history, the leave requests,
   * the profile and the audit history stay in the database.
   */
  const changeDeactivation = async (deactivate: boolean) => {
    if (!selectedId) {
      return;
    }

    const confirmed = window.confirm(
      deactivate
        ? "Deactivate this account? The cadet cannot sign in and cannot use the portal any more. The attendance history, the leave requests and the profile are kept."
        : "Reactivate this account? The cadet can sign in and use the portal again."
    );

    if (!confirmed) {
      return;
    }

    setIsApproving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/cadets", {
        method: deactivate ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: deactivate
          ? undefined
          : JSON.stringify({ userId: selectedId, deactivated: false }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice({
          kind: "error",
          text:
            payload.error ??
            (deactivate
              ? "The account could not be deactivated"
              : "The account could not be reactivated"),
        });
        return;
      }

      setNotice({
        kind: "success",
        text: deactivate
          ? "The account is deactivated. The history of the cadet is kept."
          : "The account is active again.",
      });

      await openDetail(selectedId);
      await load();
    } catch {
      setNotice({
        kind: "error",
        text: deactivate
          ? "The account could not be deactivated"
          : "The account could not be reactivated",
      });
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
        <h1 className="font-heading font-black text-2xl text-gray-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-ncc-red" /> Cadet directory
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Every cadet account with its roster match, approval state and profile
          completion.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <div>
            <label
              htmlFor="cadet-search"
              className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1.5"
            >
              Search
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="cadet-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setPage(1);
                    setSearch(query);
                  }
                }}
                placeholder="Name, email, PRN..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="cadet-status"
              className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1.5"
            >
              Approval
            </label>
            <select
              id="cadet-status"
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
            >
              <option value="ALL">All</option>
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="cadet-roster"
              className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1.5"
            >
              Roster
            </label>
            <select
              id="cadet-roster"
              value={rosterFilter}
              onChange={(event) => {
                setPage(1);
                setRosterFilter(event.target.value);
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
            >
              <option value="all">All</option>
              <option value="matched">Matched</option>
              <option value="unmatched">Unmatched</option>
            </select>
          </div>
        </div>

        {notice && (
          <div
            className={`mt-4 flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold ${
              notice.kind === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {notice.kind === "success" ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {notice.text}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : cadets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-2">Cadet</th>
                    <th className="py-3 px-2">Wing</th>
                    <th className="py-3 px-2">Approval</th>
                    <th className="py-3 px-2">Roster</th>
                    <th className="py-3 px-2">Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cadets.map((cadet) => (
                    <tr
                      key={cadet.id}
                      onClick={() => openDetail(cadet.id)}
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedId === cadet.id ? "bg-ncc-light-blue/10" : ""
                      }`}
                    >
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                            {cadet.cadetProfile?.photoUrl ? (
                              <Image
                                src={`/api/admin/cadets/${cadet.id}/photo?variant=thumbnail`}
                                alt=""
                                width={32}
                                height={32}
                                unoptimized
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[10px] font-bold text-gray-400">
                                {cadet.name.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 truncate">
                              {cadet.cadetProfile?.fullName ?? cadet.name}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate">
                              {cadet.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-gray-600">
                        {cadet.cadetProfile?.wing ?? "-"}
                      </td>
                      <td className="py-3 px-2">
                        {cadet.deactivatedAt ? (
                          <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 block">
                            DEACTIVATED
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-1 rounded-full text-[10px] font-bold ${statusClass(
                              cadet.approvalStatus
                            )}`}
                          >
                            {cadet.approvalStatus}
                          </span>
                        )}
                        {cadet.deactivatedAt ? (
                          <span className="block text-[10px] text-slate-500 mt-1">
                            History kept
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                            cadet.rosterMatched
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {cadet.rosterMatched ? "Matched" : "No roster row"}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-gray-600">
                        {cadet.completion.percent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 text-xs">
              <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No cadet matches this view.
            </div>
          )}

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500">
            <span>
              {total} cadet(s) • page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 font-bold inline-flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 font-bold inline-flex items-center gap-1"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {detail ? (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-6 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                  {detail.hasPhoto ? (
                    <Image
                      src={`/api/admin/cadets/${detail.user.id}/photo?variant=thumbnail`}
                      alt=""
                      width={56}
                      height={56}
                      unoptimized
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-bold text-gray-400">No photo</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="font-heading font-black text-gray-900 truncate">
                    {(detail.profile as { fullName?: string } | null)?.fullName ??
                      detail.user.name}
                  </h2>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 shrink-0" /> {detail.user.email}
                  </p>
                  <span
                    className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      detail.user.deactivatedAt
                        ? "bg-slate-200 text-slate-700"
                        : statusClass(detail.user.approvalStatus)
                    }`}
                  >
                    {detail.user.deactivatedAt
                      ? "DEACTIVATED"
                      : detail.user.approvalStatus}
                  </span>
                  {detail.user.deactivatedAt ? (
                    <p className="text-[10px] text-slate-600 mt-1">
                      The account is deactivated. The attendance history, the
                      leave requests and the profile are kept.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {detail.user.deactivatedAt ? (
                  <button
                    type="button"
                    onClick={() => changeDeactivation(false)}
                    disabled={isApproving}
                    className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => changeApproval("APPROVED")}
                      disabled={isApproving}
                      className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => changeApproval("REJECTED")}
                      disabled={isApproving}
                      className="flex-1 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </>
                )}
              </div>

              {!detail.user.deactivatedAt ? (
                <button
                  type="button"
                  onClick={() => changeDeactivation(true)}
                  disabled={isApproving}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-[11px] font-bold flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" /> Deactivate the account
                </button>
              ) : null}

              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-[11px] text-gray-600 space-y-1.5">
                <p className="flex items-center gap-1.5 font-bold text-gray-700">
                  <Shield className="w-3.5 h-3.5" /> Roster
                </p>
                {detail.roster ? (
                  <>
                    <p>{detail.roster.fullName} ({detail.roster.email})</p>
                    <p>
                      PRN {detail.roster.prn ?? "-"} • Regt {detail.roster.regiNumber ?? "-"}
                    </p>
                    <p>
                      {detail.roster.wing ?? "-"} • {detail.roster.division ?? "-"} •{" "}
                      {detail.roster.year ?? "-"}
                    </p>
                    <p
                      className={
                        detail.roster.active ? "text-emerald-700" : "text-amber-700"
                      }
                    >
                      {detail.roster.active
                        ? "The roster row is active"
                        : "The roster row is inactive"}
                    </p>
                  </>
                ) : (
                  <p>No roster row matches this account.</p>
                )}
              </div>

              <div>
                <h3 className="font-heading font-bold text-sm text-gray-900 mb-3">
                  Administrator owned fields
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {EDITABLE_DETAIL_FIELDS.map((field) => (
                    <div key={field.field}>
                      <label
                        htmlFor={`detail-${field.field}`}
                        className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1"
                      >
                        {field.label}
                      </label>
                      <input
                        id={`detail-${field.field}`}
                        type={field.type ?? "text"}
                        value={detailValues[field.field] ?? ""}
                        onChange={(event) =>
                          setDetailValues((current) => ({
                            ...current,
                            [field.field]: event.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={saveDetail}
                  disabled={isSaving}
                  className="mt-4 w-full px-4 py-2.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save the record
                </button>
              </div>

              {detail.correctionRequests.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-2">
                  <p className="font-bold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> Correction requests
                  </p>
                  {detail.correctionRequests.map((request) => (
                    <p key={request.id}>
                      {request.newData?.field}: {request.newData?.value} —{" "}
                      {request.newData?.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-xs">
              <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              Select a cadet to inspect the profile, the roster match and the
              approval state.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
