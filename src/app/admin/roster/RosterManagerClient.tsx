"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  FileSpreadsheet,
  RefreshCw,
  UserCheck,
  UserX,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type RosterEntry = {
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
  matched: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    approvalStatus: string;
    role: string;
    hasProfile: boolean;
    hasPhoto: boolean;
  } | null;
};

type ImportSummary = {
  imported: number;
  created: number;
  updated: number;
  matched: number;
  unmatched: { email: string; fullName: string; reason: string }[];
  attention: { email: string; message: string }[];
};

const PAGE_SIZE = 50;

export default function RosterManagerClient() {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<
    { line: number; email: string; error: string }[]
  >([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        active: activeFilter,
        match: matchFilter,
      });

      if (search.trim()) {
        params.set("q", search.trim());
      }

      const response = await fetch(`/api/admin/roster?${params.toString()}`);

      if (!response.ok) {
        setNotice({ kind: "error", text: "The roster could not be loaded" });
        return;
      }

      const payload = await response.json();
      setEntries(payload.roster ?? []);
      setTotal(payload.total ?? 0);
      setTotalPages(payload.totalPages ?? 1);
    } catch {
      setNotice({ kind: "error", text: "The roster could not be loaded" });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, activeFilter, matchFilter]);

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

  const runImport = async (dryRun: boolean) => {
    setIsImporting(true);
    setImportErrors([]);
    setImportSummary(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, dryRun }),
      });

      const payload = await response.json();

      if (dryRun) {
        setImportErrors(payload.invalid ?? []);
        setNotice({
          kind: payload.invalid?.length ? "error" : "success",
          text: payload.invalid?.length
            ? `${payload.valid} valid row(s), ${payload.invalid.length} row(s) need attention`
            : `${payload.valid} valid row(s) ready to import, ${payload.matched} matched to an account`,
        });
        return;
      }

      if (!response.ok) {
        setImportErrors(payload.invalid ?? []);
        setNotice({
          kind: "error",
          text: payload.error ?? "The roster could not be imported",
        });
        return;
      }

      setImportSummary({
        imported: payload.imported,
        created: payload.created,
        updated: payload.updated,
        matched: payload.matched,
        unmatched: payload.unmatched ?? [],
        attention: payload.attention ?? [],
      });
      setCsv("");
      setNotice({
        kind: "success",
        text: `${payload.imported} roster row(s) imported, ${payload.matched} matched to an account`,
      });
      await load();
    } catch {
      setNotice({ kind: "error", text: "The roster could not be imported" });
    } finally {
      setIsImporting(false);
    }
  };

  const setActive = async (entry: RosterEntry, active: boolean) => {
    const confirmed = window.confirm(
      active
        ? `Reactivate ${entry.fullName} on the roster?`
        : `Deactivate ${entry.fullName} on the roster?\n\nThe account is not deleted, the role is not changed and the approval state is not changed.`
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(entry.id);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rosterId: entry.id, active }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setNotice({
          kind: "error",
          text: payload.error ?? "The roster row could not be updated",
        });
        return;
      }

      setNotice({
        kind: "success",
        text: active
          ? `${entry.fullName} is active again`
          : `${entry.fullName} is deactivated`,
      });
      await load();
    } catch {
      setNotice({ kind: "error", text: "The roster row could not be updated" });
    } finally {
      setIsSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading font-black text-2xl text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-ncc-red" /> Roster manager
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              The normalised email address is the only authoritative field. The
              other columns pre-fill the cadet profile and never decide an
              approval.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reload
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="roster-csv"
              className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2"
            >
              CSV file content
            </label>
            <textarea
              id="roster-csv"
              rows={6}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder={
                "email,full name,prn,wing,year\ncadet@mitwpu.edu.in,Example Cadet,1032200123,Army,1st Year"
              }
              className="w-full px-3 sm:px-4 py-3 rounded-xl border border-gray-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => runImport(true)}
              disabled={isImporting || !csv.trim()}
              className="px-5 py-2.5 rounded-xl bg-ncc-dark-blue hover:bg-ncc-navy disabled:opacity-50 text-white font-bold text-xs transition-all flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Check file
            </button>
            <button
              type="button"
              onClick={() => runImport(false)}
              disabled={isImporting || !csv.trim()}
              className="px-5 py-2.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light disabled:opacity-50 text-white font-bold text-xs transition-all flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              Import roster
            </button>
          </div>

          {importErrors.length > 0 && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200">
              <ul className="space-y-1 text-[11px] text-red-700">
                {importErrors.map((issue, index) => (
                  <li key={`${issue.line}-${index}`}>
                    Line {issue.line}
                    {issue.email ? ` (${issue.email})` : ""}: {issue.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importSummary && (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-2">
              <p className="font-bold">
                {importSummary.imported} row(s) imported: {importSummary.created}{" "}
                new, {importSummary.updated} updated, {importSummary.matched}{" "}
                matched to an account.
              </p>
              {importSummary.unmatched.length > 0 && (
                <p className="text-amber-700">
                  {importSummary.unmatched.length} row(s) have no account yet.
                  The cadet is approved automatically at the first sign in.
                </p>
              )}
              {importSummary.attention.map((item) => (
                <p key={item.email} className="text-amber-700">
                  {item.email}: {item.message}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div>
            <label
              htmlFor="roster-search"
              className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1.5"
            >
              Search
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="roster-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setPage(1);
                    setSearch(query);
                  }
                }}
                placeholder="Name, email, PRN, wing..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="roster-active"
              className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1.5"
            >
              State
            </label>
            <select
              id="roster-active"
              value={activeFilter}
              onChange={(event) => {
                setPage(1);
                setActiveFilter(event.target.value);
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
            >
              <option value="all">All rows</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="roster-match"
              className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1.5"
            >
              Account
            </label>
            <select
              id="roster-match"
              value={matchFilter}
              onChange={(event) => {
                setPage(1);
                setMatchFilter(event.target.value);
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
            className={`mb-4 flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold ${
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

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : entries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3">Name</th>
                  <th className="py-3 px-3">Email</th>
                  <th className="py-3 px-3">PRN</th>
                  <th className="py-3 px-3">Wing</th>
                  <th className="py-3 px-3">Year</th>
                  <th className="py-3 px-3">Account</th>
                  <th className="py-3 px-3">State</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3 px-3 font-bold text-gray-900">
                      {entry.fullName}
                    </td>
                    <td className="py-3 px-3 text-gray-700 break-all">
                      {entry.email}
                    </td>
                    <td className="py-3 px-3 text-gray-600">{entry.prn ?? "-"}</td>
                    <td className="py-3 px-3 text-gray-600">{entry.wing ?? "-"}</td>
                    <td className="py-3 px-3 text-gray-600">{entry.year ?? "-"}</td>
                    <td className="py-3 px-3">
                      {entry.user ? (
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            entry.user.approvalStatus === "APPROVED"
                              ? "bg-emerald-100 text-emerald-800"
                              : entry.user.approvalStatus === "REJECTED"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {entry.user.approvalStatus}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
                          No account
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          entry.active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {entry.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => setActive(entry, !entry.active)}
                        disabled={isSaving === entry.id}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-bold text-[11px] inline-flex items-center gap-1.5"
                      >
                        {entry.active ? (
                          <>
                            <UserX className="w-3.5 h-3.5" /> Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" /> Reactivate
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400 text-xs">
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No roster rows match this view.
          </div>
        )}

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <span>
            {total} row(s) • page {page} of {totalPages}
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
    </div>
  );
}
