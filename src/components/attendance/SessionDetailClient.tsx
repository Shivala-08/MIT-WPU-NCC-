"use client";

import { formatCalendarDate, formatIstTime } from "@/lib/calendar-date.mjs";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  MapPin,
  QrCode,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { sessionStatusClass } from "./AttendanceSessionsClient";

const MARK_OPTIONS = [
  { value: "PRESENT", label: "Present" },
  { value: "ON_DUTY", label: "On duty" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
  { value: "EXCUSED", label: "Excused" },
  { value: "LEAVE", label: "Leave" },
];

const MARK_CLASS: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800",
  ON_DUTY: "bg-blue-100 text-blue-800",
  LATE: "bg-amber-100 text-amber-800",
  ABSENT: "bg-red-100 text-red-700",
  EXCUSED: "bg-purple-100 text-purple-800",
  LEAVE: "bg-teal-100 text-teal-800",
};

type CadetRow = {
  id: string;
  name: string;
  email: string;
  fullName: string;
  prn: string | null;
  regiNumber: string | null;
  wing: string | null;
  division: string | null;
  year: string | null;
  branch: string | null;
};

type AttendanceRow = {
  id: string;
  userId: string;
  status: string;
  method: string;
  note: string | null;
  markedAt: string;
  markedBy: { id: string; name: string } | null;
};

type SessionDetail = {
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
  cancelReason: string | null;
  createdBy: { id: string; name: string } | null;
  attendances: AttendanceRow[];
};

type Totals = Record<string, number>;

type ActionCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  success: string;
  tone?: "default" | "danger";
  reason?: {
    label: string;
    placeholder?: string;
    minLength?: number;
    required?: boolean;
    helper?: string;
  };
};

// The copy of the three session actions. Every action asks for a confirmation
// before it is sent to the server.
const ACTION_COPY: Record<"open" | "close" | "cancel", ActionCopy> = {
  open: {
    title: "Open this session?",
    description:
      "The cadets can check in with the QR code and the officers can mark the roll.",
    confirmLabel: "Open the session",
    success: "The session was opened.",
  },
  close: {
    title: "Close this session?",
    description:
      "The check-in codes stop working. The roll stays readable and an administrator can still record a correction with a reason.",
    confirmLabel: "Close the session",
    success: "The session was closed.",
  },
  cancel: {
    title: "Cancel this session?",
    description:
      "The session is excluded from every attendance percentage. The existing records stay available for the audit history.",
    confirmLabel: "Cancel the session",
    success: "The session was cancelled.",
    tone: "danger",
    reason: {
      label: "Why is the session cancelled?",
      placeholder: "The unit was on a holiday",
      minLength: 5,
      required: true,
      helper:
        "The reason is stored in the audit history and needs at least 5 characters.",
    },
  },
};

export default function SessionDetailClient({
  sessionId,
  role,
  basePath,
}: {
  sessionId: string;
  role: "ADMIN" | "OFFICER";
  basePath: string;
}) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [totals, setTotals] = useState<Totals>({});
  const [cadets, setCadets] = useState<CadetRow[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [leaves, setLeaves] = useState<
    { id: string; userId: string; type: string; startDate: string; endDate: string }[]
  >([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * The message of a roll that could not be loaded.
   *
   * A roll that fails to load is never shown as an empty roll. An officer
   * would mark a session of zero cadets and believe that the unit is empty.
   */
  const [rollError, setRollError] = useState<string | null>(null);
  const [isRollLoading, setIsRollLoading] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [manualExpiresAt, setManualExpiresAt] = useState<string | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "open" | "close" | "cancel" | null
  >(null);
  const [isDirty, setIsDirty] = useState(false);

  const showNotice = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/admin/attendance/sessions/${sessionId}`);

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "The session could not be loaded");
      }

      const payload = await response.json();

      setSession(payload.session);
      setTotals(payload.totals ?? {});

      const nextMarks: Record<string, string> = {};

      for (const record of payload.session.attendances ?? []) {
        nextMarks[record.userId] = record.status;
      }

      setMarks(nextMarks);
      setIsDirty(false);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "The session could not be loaded"
      );
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

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

  /**
   * Loads the roll of the unit and the leave indicators of the session.
   *
   * The guard tells the loader whether the screen is still mounted. A roll
   * that fails to load is reported and never shown as an empty roll.
   */
  const loadRoll = useCallback(
    async (isActive: () => boolean = () => true) => {
      setIsRollLoading(true);
      setRollError(null);

      try {
        const [rollResponse, leaveResponse] = await Promise.all([
          fetch("/api/admin/attendance/roll"),
          fetch(
            `/api/admin/attendance/leave-indicators?from=${encodeURIComponent(
              session?.date
                ? new Date(session.date).toISOString().slice(0, 10)
                : ""
            )}&to=${encodeURIComponent(
              session?.date
                ? new Date(session.date).toISOString().slice(0, 10)
                : ""
            )}`
          ),
        ]);

        if (!rollResponse.ok) {
          const payload = await rollResponse.json().catch(() => ({}));

          if (isActive()) {
            setCadets([]);
            setRollError(
              payload.error ??
                `The roll could not be loaded (HTTP ${rollResponse.status}).`
            );
          }

          return;
        }

        const roll = await rollResponse.json();

        if (isActive()) {
          setCadets(roll.cadets ?? []);
          setRollError(null);
        }

        // The leave indicators are supplementary. A failure of the leave
        // list never empties the roll, but it is reported as well.
        if (leaveResponse.ok) {
          const leavePayload = await leaveResponse.json();

          if (isActive()) {
            setLeaves(leavePayload.leaves ?? []);
          }
        } else {
          const payload = await leaveResponse.json().catch(() => ({}));

          if (isActive()) {
            setLeaves([]);
            showNotice(
              "error",
              payload.error ??
                `The leave list could not be loaded (HTTP ${leaveResponse.status}).`
            );
          }
        }
      } catch (error) {
        if (isActive()) {
          setCadets([]);
          setLeaves([]);
          setRollError(
            error instanceof Error
              ? error.message
              : "The roll could not be loaded."
          );
        }
      } finally {
        if (isActive()) {
          setIsRollLoading(false);
        }
      }
    },
    [session, showNotice]
  );

  useEffect(() => {
    let active = true;

    // The loader is started after the current tick, so the state of the
    // screen is never changed inside the effect itself.
    const run = async () => {
      await Promise.resolve();

      if (session && active) {
        await loadRoll(() => active);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [session, loadRoll]);

  const leaveByCadet = useMemo(() => {
    const map = new Map<string, string>();

    for (const leave of leaves) {
      map.set(leave.userId, leave.type);
    }

    return map;
  }, [leaves]);

  // The record that is already stored for each cadet. It carries the officer
  // who marked the roll.
  const attendanceByCadet = useMemo(() => {
    const map = new Map<string, AttendanceRow>();

    for (const record of session?.attendances ?? []) {
      map.set(record.userId, record);
    }

    return map;
  }, [session]);

  // The totals of the roll as the officer sees it, including the marks that
  // are not saved yet.
  const liveTotals = useMemo(() => {
    const next: Record<string, number> = {
      total: 0,
      PRESENT: 0,
      ABSENT: 0,
      ON_DUTY: 0,
      LEAVE: 0,
      LATE: 0,
      EXCUSED: 0,
    };

    for (const status of Object.values(marks)) {
      next.total += 1;

      if (next[status] !== undefined) {
        next[status] += 1;
      }
    }

    return next;
  }, [marks]);

  const filteredCadets = useMemo(() => {
    const term = search.trim().toLowerCase();

    return cadets.filter((cadet) => {
      const matchesSearch =
        term.length === 0 ||
        cadet.fullName.toLowerCase().includes(term) ||
        cadet.name.toLowerCase().includes(term) ||
        (cadet.prn ?? "").toLowerCase().includes(term) ||
        (cadet.regiNumber ?? "").toLowerCase().includes(term);

      const status = marks[cadet.id] ?? "UNMARKED";

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "UNMARKED" ? status === "UNMARKED" : status === statusFilter);

      return matchesSearch && matchesStatus;
    });
  }, [cadets, marks, search, statusFilter]);

  const canMark = session?.status === "OPEN";
  const canCorrectClosed = role === "ADMIN" && session?.status === "CLOSED";
  const canSave = canMark || canCorrectClosed;

  const handleAction = async (
    action: "open" | "close" | "cancel",
    reason?: string
  ) => {
    try {
      const response = await fetch(
        `/api/admin/attendance/sessions/${sessionId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reason ? { reason } : {}),
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "The session could not be changed");
      }

      showNotice("success", ACTION_COPY[action].success);
      setQrDataUrl(null);
      setQrExpiresAt(null);
      setManualCode(null);
      setManualExpiresAt(null);
      await load();
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error ? error.message : "The session could not be changed"
      );
    }
  };

  const handleSave = async () => {
    const entries = Object.entries(marks);

    if (entries.length === 0) {
      showNotice("error", "There is nothing to save.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/admin/attendance/sessions/${sessionId}/records`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marks: entries.map(([userId, status]) => ({ userId, status })),
            reason: correctionReason.trim() || undefined,
          }),
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "The roll could not be saved");
      }

      showNotice(
        "success",
        `${payload.created ?? 0} new mark(s) saved, ${payload.updated ?? 0} corrected.`
      );
      setCorrectionReason("");
      await load();
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error ? error.message : "The roll could not be saved"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleQr = async (action: "generate" | "revoke") => {
    setQrBusy(true);

    try {
      const response = await fetch(
        `/api/admin/attendance/sessions/${sessionId}/qr`,
        { method: action === "generate" ? "POST" : "DELETE" }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "The check-in code could not be changed");
      }

      if (action === "generate") {
        setQrDataUrl(payload.qrDataUrl ?? null);
        setQrExpiresAt(payload.expiresAt ?? null);
        showNotice("success", "A new check-in code was created.");
      } else {
        setQrDataUrl(null);
        setQrExpiresAt(null);
        showNotice("success", "The check-in code was revoked.");
      }
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error
          ? error.message
          : "The check-in code could not be changed"
      );
    } finally {
      setQrBusy(false);
    }
  };

  const handleManualCode = async (action: "generate" | "revoke") => {
    setManualBusy(true);

    try {
      const response = await fetch(
        `/api/admin/attendance/sessions/${sessionId}/manual-code`,
        { method: action === "generate" ? "POST" : "DELETE" }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ?? "The fallback code could not be changed"
        );
      }

      if (action === "generate") {
        setManualCode(payload.code ?? null);
        setManualExpiresAt(payload.expiresAt ?? null);
        showNotice("success", "A new fallback code was created.");
      } else {
        setManualCode(null);
        setManualExpiresAt(null);
        showNotice("success", "The fallback code was revoked.");
      }
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error
          ? error.message
          : "The fallback code could not be changed"
      );
    } finally {
      setManualBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading the session
        </div>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="min-h-screen bg-gray-100 py-10 px-4">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl p-6 border border-red-300 bg-red-50">
          <div className="flex items-start gap-3 text-red-900">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-bold">The session could not be loaded</p>
              <p className="text-sm mt-1">{loadError}</p>
              <Link
                href={basePath}
                className="inline-block mt-3 text-sm font-semibold text-ncc-dark-blue underline"
              >
                Back to the session list
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="bg-ncc-dark-blue text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Link
                href={basePath}
                className="text-[11px] sm:text-xs text-white/60 hover:text-white"
              >
                Back to the session list
              </Link>
              <h1 className="font-heading font-black text-xl sm:text-2xl mt-1">
                {session.title}
              </h1>
              <p className="text-white/70 text-xs sm:text-sm mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatCalendarDate(session.date)}
                  {session.startTime && session.endTime
                    ? ` ${session.startTime} - ${session.endTime}`
                    : ""}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {session.venue || "No venue"}
                </span>
                <span>{session.type.replace(/_/g, " ")}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${sessionStatusClass(
                  session.status
                )}`}
              >
                {session.status}
              </span>

              {session.status === "DRAFT" ? (
                <button
                  type="button"
                  onClick={() => setPendingAction("open")}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold touch-target"
                >
                  Open session
                </button>
              ) : null}

              {session.status === "OPEN" ? (
                <button
                  type="button"
                  onClick={() => setPendingAction("close")}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold touch-target"
                >
                  Close session
                </button>
              ) : null}

              {role === "ADMIN" && session.status !== "CANCELLED" ? (
                <button
                  type="button"
                  onClick={() => setPendingAction("cancel")}
                  className="px-4 py-2.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light text-white text-xs font-bold touch-target"
                >
                  Cancel session
                </button>
              ) : null}
            </div>
          </div>

          {session.status === "CANCELLED" && session.cancelReason ? (
            <p className="mt-4 text-xs bg-white/10 rounded-xl px-3 py-2">
              Cancelled: {session.cancelReason}
            </p>
          ) : null}

          {session.status === "DRAFT" ? (
            <p className="mt-4 text-xs bg-white/10 rounded-xl px-3 py-2">
              A draft session is not visible to the cadets and cannot be marked.
              Open it to start the attendance.
            </p>
          ) : null}
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
          <section className="lg:col-span-2 bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg">
                  Attendance roll
                </h2>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-1">
                  {totals?.total ?? 0} marked, {cadets.length} approved cadets in
                  the unit.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative">
                  <label htmlFor="roll-search" className="sr-only">
                    Search a cadet
                  </label>
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="roll-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Name, PRN or regt no"
                    className="pl-9 pr-3 py-2 rounded-xl border border-gray-300 text-xs w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                  />
                </div>

                <label htmlFor="roll-status-filter" className="sr-only">
                  Filter by attendance status
                </label>
                <select
                  id="roll-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                >
                  <option value="ALL">All</option>
                  <option value="UNMARKED">Unmarked</option>
                  {MARK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!canMark && !canCorrectClosed ? (
              <div className="flex items-start gap-3 p-3 sm:p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs sm:text-sm mb-4">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <p>
                  {session.status === "CLOSED"
                    ? "The session is closed. The roll is read only. An administrator can record a correction with a reason."
                    : session.status === "CANCELLED"
                      ? "The session is cancelled. The records stay available for the audit history."
                      : "Open the session to mark the roll."}
                </p>
              </div>
            ) : null}

            {rollError ? (
              <div
                role="alert"
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-red-50 border border-red-300 text-red-900 text-xs sm:text-sm mb-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-bold">The roll could not be loaded</p>
                    <p className="mt-1">{rollError}</p>
                    <p className="mt-1 text-red-800">
                      The roll is not empty. Nothing was marked until it was
                      loaded again.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void loadRoll()}
                  disabled={isRollLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-red-300 text-red-900 text-xs font-bold disabled:opacity-50 touch-target"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isRollLoading ? "animate-spin" : ""}`}
                  />
                  Try again
                </button>
              </div>
            ) : null}

            {!rollError && filteredCadets.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-2xl">
                <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-700">
                  No cadet matches this filter
                </p>
              </div>
            ) : null}

            {!rollError && filteredCadets.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead>
                    <tr className="border-b text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                      <th scope="col" className="py-2 px-2">
                        Cadet
                      </th>
                      <th scope="col" className="py-2 px-2">
                        Wing / Division
                      </th>
                      <th scope="col" className="py-2 px-2">
                        Leave
                      </th>
                      <th scope="col" className="py-2 px-2 text-right">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCadets.map((cadet) => {
                      const status = marks[cadet.id] ?? "UNMARKED";
                      const leaveType = leaveByCadet.get(cadet.id);
                      const record = attendanceByCadet.get(cadet.id);

                      return (
                        <tr key={cadet.id} className="hover:bg-gray-50/70">
                          <td className="py-2.5 px-2">
                            <p className="font-semibold text-gray-900">
                              {cadet.fullName}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {cadet.prn || cadet.regiNumber || cadet.email}
                            </p>
                            {record?.markedBy ? (
                              <p className="text-[10px] text-gray-400">
                                marked by {record.markedBy.name}
                              </p>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-2 text-gray-600">
                            {cadet.wing || "-"} / {cadet.division || "-"}
                          </td>
                          <td className="py-2.5 px-2">
                            {leaveType ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800">
                                {leaveType} leave
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              {MARK_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  disabled={!canMark && !canCorrectClosed}
                                  onClick={() => {
                                    setMarks((current) => ({
                                      ...current,
                                      [cadet.id]: option.value,
                                    }));
                                    setIsDirty(true);
                                  }}
                                  aria-pressed={status === option.value}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-40 ${
                                    status === option.value
                                      ? MARK_CLASS[option.value]
                                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
              {canCorrectClosed ? (
                <div>
                  <label
                    htmlFor="correction-reason"
                    className="block text-xs font-bold text-gray-600 mb-1"
                  >
                    Correction reason (required for a closed session)
                  </label>
                  <input
                    id="correction-reason"
                    value={correctionReason}
                    onChange={(event) => setCorrectionReason(event.target.value)}
                    maxLength={500}
                    placeholder="Written statement of the cadet"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={isSaving || !canSave || Boolean(rollError)}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-ncc-red hover:bg-ncc-red-light text-white text-sm font-bold disabled:opacity-50 touch-target"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save the roll
                </button>

                {canMark && filteredCadets.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMarks((current) => {
                        const next = { ...current };

                        for (const cadet of filteredCadets) {
                          next[cadet.id] = "PRESENT";
                        }

                        return next;
                      });
                      setIsDirty(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-semibold touch-target"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Mark the list present
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    void load();
                    void loadRoll();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold touch-target"
                >
                  <RefreshCw className="w-4 h-4" /> Reload
                </button>

                {isDirty ? (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2">
                    Unsaved changes. Save the roll to write them.
                  </span>
                ) : null}
              </div>

              <p className="text-[11px] text-gray-500">
                Every change is written to the audit history with the previous
                value, the actor and the time.
              </p>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <QrCode className="w-5 h-5 text-ncc-red" />
                <h2 className="font-heading font-bold text-gray-900 text-sm sm:text-base">
                  QR check-in
                </h2>
              </div>

              {session.status !== "OPEN" ? (
                <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-3">
                  A check-in code needs an open session.
                </p>
              ) : (
                <>
                  {qrDataUrl ? (
                    <div className="space-y-3">
                      {/* The QR image is generated on the server from an opaque token. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrDataUrl}
                        alt="Session check-in QR code"
                        className="w-full max-w-xs mx-auto rounded-2xl border border-gray-200"
                      />
                      <p className="text-[11px] text-gray-600 text-center">
                        The code expires at{" "}
                        {qrExpiresAt
                          ? formatIstTime(qrExpiresAt)
                          : "the end of the session window"}
                        . A code can be photographed, so the officer has to
                        supervise the check-in.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-3">
                      No active code. Generate one to let the cadets scan the
                      screen.
                    </p>
                  )}

                  <div className="flex flex-col gap-2 mt-3">
                    <button
                      type="button"
                      disabled={qrBusy}
                      onClick={() => void handleQr("generate")}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ncc-dark-blue hover:bg-ncc-light-blue text-white text-xs font-bold disabled:opacity-50 touch-target"
                    >
                      {qrBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <QrCode className="w-4 h-4" />
                      )}
                      {qrDataUrl ? "Regenerate the code" : "Generate the code"}
                    </button>

                    {qrDataUrl ? (
                      <button
                        type="button"
                        disabled={qrBusy}
                        onClick={() => void handleQr("revoke")}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-800 text-xs font-bold disabled:opacity-50 touch-target"
                      >
                        <X className="w-4 h-4" /> Revoke the code
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </section>

            <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <KeyRound className="w-5 h-5 text-ncc-red" />
                <h2 className="font-heading font-bold text-gray-900 text-sm sm:text-base">
                  Fallback code
                </h2>
              </div>

              {session.status !== "OPEN" ? (
                <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-3">
                  A fallback code needs an open session.
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-600">
                    Read this code out to a cadet whose phone cannot scan the QR
                    code. It expires quickly and only works for this session.
                  </p>

                  {manualCode ? (
                    <div className="mt-3 bg-ncc-dark-blue text-white rounded-2xl px-4 py-5 text-center">
                      <p className="text-[10px] uppercase tracking-widest text-white/60">
                        Fallback code
                      </p>
                      <p className="font-mono text-3xl font-black tracking-[0.35em] mt-2">
                        {manualCode}
                      </p>
                      {manualExpiresAt ? (
                        <p className="text-[11px] text-white/70 mt-2">
                          Expires at{" "}
                          {formatIstTime(manualExpiresAt)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-3 mt-3">
                      No active code. Create one to check a cadet in without a
                      camera.
                    </p>
                  )}

                  <div className="flex flex-col gap-2 mt-3">
                    <button
                      type="button"
                      disabled={manualBusy}
                      onClick={() => void handleManualCode("generate")}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ncc-dark-blue hover:bg-ncc-light-blue text-white text-xs font-bold disabled:opacity-50 touch-target"
                    >
                      {manualBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <KeyRound className="w-4 h-4" />
                      )}
                      {manualCode ? "Create a new code" : "Create a code"}
                    </button>

                    {manualCode ? (
                      <button
                        type="button"
                        disabled={manualBusy}
                        onClick={() => void handleManualCode("revoke")}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-800 text-xs font-bold disabled:opacity-50 touch-target"
                      >
                        <X className="w-4 h-4" /> Revoke the code
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </section>

            <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
              <h2 className="font-heading font-bold text-gray-900 text-sm sm:text-base mb-3">
                Session totals
              </h2>

              <ul className="space-y-2 text-xs">
                {MARK_OPTIONS.map((option) => (
                  <li
                    key={option.value}
                    className="flex items-center justify-between"
                  >
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${MARK_CLASS[option.value]}`}
                    >
                      {option.label}
                    </span>
                    <span className="font-bold text-gray-900">
                      {liveTotals[option.value] ?? 0}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-[11px] text-gray-500">
                {liveTotals.total} of {cadets.length} approved cadets marked.
                {isDirty ? " The numbers include the marks that are not saved yet." : ""}
              </p>

              <p className="mt-4 text-[11px] text-gray-500 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                One record per cadet and session. The unique rule of the
                database rejects a second record.
              </p>

              {session.createdBy ? (
                <p className="mt-2 text-[11px] text-gray-500">
                  Created by {session.createdBy.name}.
                </p>
              ) : null}

              {role === "ADMIN" && session.status !== "CANCELLED" ? (
                <button
                  type="button"
                  onClick={() => setPendingAction("cancel")}
                  className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold text-red-700"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Cancel this session
                </button>
              ) : null}
            </section>
          </aside>
        </div>
      </div>

      {pendingAction ? (
        <ConfirmDialog
          open
          title={ACTION_COPY[pendingAction].title}
          description={ACTION_COPY[pendingAction].description}
          confirmLabel={ACTION_COPY[pendingAction].confirmLabel}
          tone={ACTION_COPY[pendingAction].tone ?? "default"}
          reason={ACTION_COPY[pendingAction].reason}
          onCancel={() => setPendingAction(null)}
          onConfirm={(reason) => {
            const action = pendingAction;
            setPendingAction(null);
            void handleAction(action, reason || undefined);
          }}
        />
      ) : null}
    </div>
  );
}
