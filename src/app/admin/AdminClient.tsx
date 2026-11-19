"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { formatCalendarDate } from "@/lib/calendar-date.mjs";

import {
  Shield,
  ShieldAlert,
  Users,
  Calendar,
  BookOpen,
  Bell,
  Mail,

  Plus,
  Trash2,
  UserX,
  CheckCircle,
  Check,
  Clock,
  Search,
  LogOut,
  FileSpreadsheet,
  X,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import ConfirmDialog from "@/components/attendance/ConfirmDialog";

interface Attendance {
  id: string;
  status: string;
  userId: string;
  sessionId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface Cadet {
  id: string;
  name: string;
  email: string;
  approvalStatus: string;
  /**
   * The moment the account was deactivated, or null while it is active.
   * A deactivated cadet is not deleted. Its attendance history, its leave
   * requests and its profile stay in the database.
   */
  deactivatedAt: string | Date | null;
  cadetProfile: {
    fullName: string;
    regiNumber: string | null;
    wing: string | null;
    division: string | null;
    year: string | null;
    branch: string | null;
    prn: string | null;
    phone: string | null;
    bloodGroup: string | null;
    gender: string | null;
    status: string;
    parentContact: string | null;
  } | null;
  attendances: Attendance[];
}

interface Session {
  id: string;
  title: string;
  type: string;
  date: string | Date;
  startTime: string | null;
  endTime: string | null;
  attendances: Attendance[];
}

interface Material {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileUrl: string;
  fileType: string;
  fileSize: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
  priority: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface Message {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: string | Date;
}

interface AdminClientProps {
  initialCadets: Cadet[];
  initialSessions: Session[];
  initialMaterials: Material[];
  initialAnnouncements: Announcement[];
  initialMessages: Message[];
  stats: {
    totalCadets: number;
    pendingCount: number;
    approvedCount: number;
    totalSessions: number;
  };
}

type AdminTab =
  | "overview"
  | "cadets"
  | "attendance"
  | "materials"
  | "announcements"
  | "messages"
  | "roster";

export default function AdminClient({
  initialCadets,
  initialSessions,
  initialMaterials,
  initialAnnouncements,
  initialMessages,
  stats,
}: AdminClientProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  // State collections
  const [cadets, setCadets] = useState(initialCadets);
  const [sessions] = useState(initialSessions);
  const [materials, setMaterials] = useState(initialMaterials);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [messages] = useState(initialMessages);

  // Cadet filtering
  const [cadetSearch, setCadetSearch] = useState("");
  const [cadetWingFilter, setCadetWingFilter] = useState("ALL");
  const [cadetStatusFilter, setCadetStatusFilter] = useState("ALL");

  // Material form
  const [materialForm, setMaterialForm] = useState({
    title: "",
    category: "Drill",
    fileUrl: "",
    fileType: "PDF",
    description: "",
  });

  // Announcement form
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    content: "",
    priority: "1",
  });

  // Action feedback
  const [toastMessage, setToastMessage] = useState("");
  const [toastTone, setToastTone] = useState<"success" | "error">("success");

  // Deactivation of a cadet account. The account is never deleted, so the
  // administrator confirms the action in a dialog and sees the result of it.
  const [deactivationTarget, setDeactivationTarget] = useState<Cadet | null>(
    null
  );
  const [deactivationBusy, setDeactivationBusy] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const showToast = (msg: string, tone: "success" | "error" = "success") => {
    setToastMessage(msg);
    setToastTone(tone);
    setTimeout(() => setToastMessage(""), 6000);
  };

  // --- CADET ACTIONS ---
  const handleCadetStatus = async (userId: string, status: "APPROVED" | "REJECTED") => {
    try {
      const res = await fetch("/api/admin/cadets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status }),
      });
      if (res.ok) {
        const payload = await res.json();
        setCadets((prev) =>
          prev.map((c) =>
            c.id === userId
              ? {
                  ...c,
                  approvalStatus: payload.user?.approvalStatus ?? status,
                  cadetProfile: c.cadetProfile
                    ? { ...c.cadetProfile, status }
                    : null,
                }
              : c
          )
        );
        showToast(`Cadet status updated to ${status}`);
      } else {
        const payload = await res.json().catch(() => ({}));
        showToast(
          payload.error || "Failed to update cadet status",
          "error"
        );
      }
    } catch {
      showToast("Failed to update cadet status", "error");
    }
  };

  /**
   * Deactivates a cadet account.
   *
   * The account is not deleted. The attendance history, the leave requests,
   * the profile and the audit history stay in the database and keep their
   * original owner. The account simply cannot be used any more.
   */
  const handleDeactivateCadet = async (reason: string) => {
    if (!deactivationTarget) return;

    setDeactivationBusy(true);

    try {
      const params = new URLSearchParams({ userId: deactivationTarget.id });
      if (reason.trim().length > 0) {
        params.set("reason", reason.trim());
      }

      const res = await fetch(`/api/admin/cadets?${params.toString()}`, {
        method: "DELETE",
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(
          payload.error || "Failed to deactivate the cadet account",
          "error"
        );
        return;
      }

      const deactivatedAt =
        payload.deactivatedAt ?? new Date().toISOString();

      // The new state is reflected in the table right away.
      setCadets((prev) =>
        prev.map((c) =>
          c.id === deactivationTarget.id ? { ...c, deactivatedAt } : c
        )
      );

      setDeactivationTarget(null);

      showToast(
        payload.alreadyDeactivated
          ? "This account was already deactivated."
          : "Cadet account deactivated. The attendance history, the leave requests and the profile are kept."
      );
    } catch {
      showToast("Failed to deactivate the cadet account", "error");
    } finally {
      setDeactivationBusy(false);
    }
  };

  const handleReactivateCadet = async (userId: string) => {
    try {
      const res = await fetch("/api/admin/cadets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, deactivated: false }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(
          payload.error || "Failed to reactivate the cadet account",
          "error"
        );
        return;
      }

      setCadets((prev) =>
        prev.map((c) =>
          c.id === userId ? { ...c, deactivatedAt: null } : c
        )
      );

      showToast(
        payload.alreadyActive
          ? "This account was already active."
          : "Cadet account reactivated."
      );
    } catch {
      showToast("Failed to reactivate the cadet account", "error");
    }
  };

  /**
   * Downloads the spreadsheet of the cadets.
   *
   * The success message is only shown when the server really delivered the
   * file. A navigation to the export route reports a success even when the
   * export failed, and the administrator believes that the spreadsheet exists.
   */
  const exportCadetsToExcel = async () => {
    setIsExporting(true);

    try {
      const res = await fetch("/api/admin/cadets/export");

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));

        showToast(
          payload.error || "The spreadsheet could not be exported",
          "error"
        );

        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename =
        /filename="?([^";]+)"?/.exec(disposition)?.[1] ??
        "NCC_MITWPU_Cadets.xlsx";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      showToast("Excel spreadsheet downloaded successfully");
    } catch {
      showToast("The spreadsheet could not be exported", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const filteredCadets = cadets.filter((c) => {
    const p = c.cadetProfile;
    const matchesSearch =
      (c.name && c.name.toLowerCase().includes(cadetSearch.toLowerCase())) ||
      (c.email && c.email.toLowerCase().includes(cadetSearch.toLowerCase())) ||
      (p?.regiNumber &&
        p.regiNumber.toLowerCase().includes(cadetSearch.toLowerCase())) ||
      (p?.branch && p.branch.toLowerCase().includes(cadetSearch.toLowerCase()));

    const matchesWing =
      cadetWingFilter === "ALL" || p?.wing === cadetWingFilter;
    const matchesStatus =
      cadetStatusFilter === "ALL" || c.approvalStatus === cadetStatusFilter;

    return matchesSearch && matchesWing && matchesStatus;
  });

  // --- STUDY MATERIAL ACTIONS ---
  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/study-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(materialForm),
      });
      const data = await res.json();
      if (res.ok) {
        setMaterials([data.material, ...materials]);
        setMaterialForm({
          title: "",
          category: "Drill",
          fileUrl: "",
          fileType: "PDF",
          description: "",
        });
        showToast("Study material added successfully!");
      } else {
        const payload = await res.json().catch(() => ({}));
        showToast(
          payload.error || "The study material could not be added",
          "error"
        );
      }
    } catch {
      showToast("Error adding material", "error");
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/study-materials?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMaterials((prev) => prev.filter((m) => m.id !== id));
        showToast("Material removed");
      } else {
        const payload = await res.json().catch(() => ({}));
        showToast(payload.error || "Failed to delete", "error");
      }
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  // --- ANNOUNCEMENT ACTIONS ---
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(announcementForm),
      });
      const data = await res.json();
      if (res.ok) {
        setAnnouncements([data.announcement, ...announcements]);
        setAnnouncementForm({ title: "", content: "", priority: "1" });
        showToast("Announcement published!");
      } else {
        const payload = await res.json().catch(() => ({}));
        showToast(
          payload.error || "The announcement could not be published",
          "error"
        );
      }
    } catch {
      showToast("Error posting announcement", "error");
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/announcements?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAnnouncements((prev) => prev.filter((a) => a.id !== id));
        showToast("Announcement deleted");
      } else {
        const payload = await res.json().catch(() => ({}));
        showToast(payload.error || "Failed to delete", "error");
      }
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-sm ${
            toastTone === "error"
              ? "bg-red-700 text-white border border-red-300"
              : "bg-ncc-dark-blue text-white border border-ncc-gold/40"
          }`}
        >
          {toastTone === "error" ? (
            <ShieldAlert className="w-4 h-4 text-red-200" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          )}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Admin Top Bar */}
      <header className="bg-ncc-dark-blue text-white border-b border-ncc-gold/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-ncc-red flex items-center justify-center font-bold shadow">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-heading font-black text-lg tracking-wide">
                NCC MIT WPU
              </span>
              <span className="text-[10px] text-ncc-gold uppercase tracking-widest ml-2 px-2 py-0.5 rounded bg-white/10 font-bold">
                Admin Command Center
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/admin/attendance"
              className="text-xs text-white/80 hover:text-white flex items-center gap-1"
            >
              Attendance
            </Link>
            <Link
              href="/admin/leave"
              className="text-xs text-white/80 hover:text-white flex items-center gap-1"
            >
              Leave
            </Link>
            <Link
              href="/admin/reports/attendance"
              className="text-xs text-white/80 hover:text-white flex items-center gap-1"
            >
              Reports
            </Link>
            <Link
              href="/admin/audit"
              className="text-xs text-white/80 hover:text-white flex items-center gap-1"
            >
              Audit
            </Link>
            <Link
              href="/"
              target="_blank"
              className="text-xs text-white/80 hover:text-white flex items-center gap-1"
            >
              View Site <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-ncc-red text-white text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-2 sm:space-x-8 overflow-x-auto py-2 scrollbar-none">
            {([
              { id: "overview", label: "Overview", icon: Shield },
              {
                id: "cadets",
                label: `Cadets (${cadets.length})`,
                icon: Users,
                badge: stats.pendingCount > 0 ? `${stats.pendingCount} Pending` : null,
              },
              {
                id: "attendance",
                label: `Attendance (${sessions.length})`,
                icon: Calendar,
              },
              { id: "materials", label: "Study Materials", icon: BookOpen },
              { id: "roster", label: "Roster", icon: FileSpreadsheet },
              { id: "announcements", label: "Noticeboard", icon: Bell },
              { id: "messages", label: `Messages (${messages.length})`, icon: Mail },
            ] satisfies { id: AdminTab; label: string; icon: LucideIcon; badge?: string | null }[]).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-ncc-dark-blue text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="text-[10px] bg-ncc-red text-white px-2 py-0.5 rounded-full font-bold">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Total Enrolled Cadets
                  </p>
                  <h3 className="text-3xl font-heading font-black text-ncc-dark-blue mt-2">
                    {cadets.length}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.approvedCount} Active Approved
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-ncc-dark-blue/10 text-ncc-dark-blue flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Pending Applications
                  </p>
                  <h3 className="text-3xl font-heading font-black text-amber-600 mt-2">
                    {stats.pendingCount}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Require ANO Review</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Clock className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Parade Sessions Logged
                  </p>
                  <h3 className="text-3xl font-heading font-black text-emerald-600 mt-2">
                    {sessions.length}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Completed Training</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Contact Messages
                  </p>
                  <h3 className="text-3xl font-heading font-black text-ncc-red mt-2">
                    {messages.length}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Received from Public</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-ncc-red flex items-center justify-center">
                  <Mail className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Quick Action Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Pending Cadets Quick List */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-heading font-bold text-lg text-gray-900">
                      Pending Approvals
                    </h3>
                    <p className="text-xs text-gray-500">
                      Review new candidates applying for cadet rank
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setCadetStatusFilter("PENDING");
                      setActiveTab("cadets");
                    }}
                    className="text-xs font-bold text-ncc-red hover:underline"
                  >
                    View All
                  </button>
                </div>

                {cadets.filter((c) => c.cadetProfile?.status === "PENDING").length > 0 ? (
                  <div className="space-y-3">
                    {cadets
                      .filter((c) => c.cadetProfile?.status === "PENDING")
                      .slice(0, 4)
                      .map((c) => (
                        <div
                          key={c.id}
                          className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between gap-4"
                        >
                          <div>
                            <h4 className="font-bold text-sm text-gray-900">
                              {c.cadetProfile?.fullName || c.name}
                            </h4>
                            <p className="text-xs text-gray-500">
                              {c.cadetProfile?.wing} Wing • {c.cadetProfile?.branch} (
                              {c.cadetProfile?.year})
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCadetStatus(c.id, "APPROVED")}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleCadetStatus(c.id, "REJECTED")}
                              className="px-3 py-1.5 rounded-xl bg-gray-200 hover:bg-red-600 hover:text-white text-gray-700 text-xs font-bold transition-all"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-400 text-xs">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    All cadet applications are processed.
                  </div>
                )}
              </div>

              {/* Recent Parade Sessions */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-heading font-bold text-lg text-gray-900">
                      Recent Parades & Camps
                    </h3>
                    <p className="text-xs text-gray-500">
                      Logged attendance sessions
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("attendance")}
                    className="text-xs font-bold text-ncc-red hover:underline"
                  >
                    Log New Session
                  </button>
                </div>

                {sessions.length > 0 ? (
                  <div className="space-y-3">
                    {sessions.slice(0, 4).map((s) => (
                      <div
                        key={s.id}
                        className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between"
                      >
                        <div>
                          <h4 className="font-bold text-sm text-gray-900">{s.title}</h4>
                          <p className="text-xs text-gray-500">
                            {formatCalendarDate(s.date)} • {s.type}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-ncc-dark-blue bg-ncc-light-blue/20 px-3 py-1 rounded-full">
                          {s.attendances?.length || 0} Cadets Logged
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-10 text-gray-400 text-xs">
                    No sessions logged yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CADETS MANAGEMENT */}
        {activeTab === "cadets" && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6">
              <div>
                <h2 className="font-heading font-black text-2xl text-gray-900">
                  Cadet Roster & Enrolments
                </h2>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">
                  Manage applications, verify medical data, and export registers
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <Link
                  href="/admin/cadets"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-ncc-dark-blue hover:bg-ncc-navy text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md"
                >
                  <Users className="w-4 h-4" /> Cadet directory
                </Link>
                <button
                  type="button"
                  onClick={() => void exportCadetsToExcel()}
                  disabled={isExporting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export to Excel (.xlsx)
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name, regt no, email..."
                  value={cadetSearch}
                  onChange={(e) => setCadetSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30"
                />
              </div>

              <div>
                <select
                  value={cadetWingFilter}
                  onChange={(e) => setCadetWingFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm bg-white"
                >
                  <option value="ALL">All Wings (Army / Navy / Air)</option>
                  <option value="Army">Army Wing</option>
                  <option value="Navy">Naval Wing</option>
                  <option value="Air">Air Wing</option>
                </select>
              </div>

              <div>
                <select
                  value={cadetStatusFilter}
                  onChange={(e) => setCadetStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm bg-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending Approval</option>
                  <option value="APPROVED">Approved Cadets</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>

            {/* Cadets Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">Cadet Name</th>
                    <th className="py-3 px-3">Regt / PRN</th>
                    <th className="py-3 px-3">Wing & Year</th>
                    <th className="py-3 px-3">Phone & Email</th>
                    <th className="py-3 px-3">Blood Grp</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCadets.map((c) => {
                    const p = c.cadetProfile;
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3.5 px-3">
                          <span className="font-bold text-gray-900 block">
                            {p?.fullName || c.name}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {p?.gender || "N/A"}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="font-mono text-gray-700 block">
                            {p?.regiNumber || "Pending"}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            PRN: {p?.prn || "N/A"}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="font-semibold text-ncc-dark-blue">
                            {p?.wing || "Army"}
                          </span>
                          <span className="text-gray-500 block text-[11px]">
                            {p?.year} • {p?.branch}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="text-gray-700 block">{p?.phone || "N/A"}</span>
                          <span className="text-[11px] text-gray-400">{c.email}</span>
                        </td>
                        <td className="py-3.5 px-3 font-semibold text-ncc-red">
                          {p?.bloodGroup || "N/A"}
                        </td>
                        <td className="py-3.5 px-3">
                          {c.deactivatedAt ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 block">
                              DEACTIVATED
                            </span>
                          ) : (
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                c.approvalStatus === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : c.approvalStatus === "PENDING"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {c.approvalStatus}
                            </span>
                          )}
                          {c.deactivatedAt ? (
                            <span className="block text-[10px] text-slate-500 mt-1">
                              History kept
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!c.deactivatedAt && c.approvalStatus !== "APPROVED" && (
                              <button
                                onClick={() => handleCadetStatus(c.id, "APPROVED")}
                                title="Approve Cadet"
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 transition-all"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {!c.deactivatedAt && c.approvalStatus !== "REJECTED" && (
                              <button
                                onClick={() => handleCadetStatus(c.id, "REJECTED")}
                                title="Reject Application"
                                className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-700 transition-all"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {c.deactivatedAt ? (
                              <button
                                onClick={() => handleReactivateCadet(c.id)}
                                title="Reactivate Cadet Account"
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 transition-all"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setDeactivationTarget(c)}
                                title="Deactivate Cadet Account"
                                className="p-1.5 rounded-lg bg-red-50 hover:bg-red-600 hover:text-white text-red-600 transition-all"
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: ATTENDANCE SYSTEM */}
        {activeTab === "attendance" && (
          <div className="space-y-8">
            {/* The attendance operations live in the phase 3 screens. */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
              <h2 className="font-heading font-black text-2xl text-gray-900">
                Attendance operations
              </h2>
              <p className="text-gray-500 text-xs sm:text-sm mt-1">
                Create a session, open it, mark the roll, run the QR check-in and
                review every change in the audit history.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link
                  href="/admin/attendance"
                  className="p-4 rounded-2xl border border-gray-200 hover:border-ncc-dark-blue hover:bg-gray-50 transition-colors"
                >
                  <p className="font-bold text-sm text-gray-900">
                    Attendance sessions
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Create, open, close and cancel the sessions of the unit.
                  </p>
                </Link>

                <Link
                  href="/admin/reports/attendance"
                  className="p-4 rounded-2xl border border-gray-200 hover:border-ncc-dark-blue hover:bg-gray-50 transition-colors"
                >
                  <p className="font-bold text-sm text-gray-900">
                    Attendance reports
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    The attendance of the unit, the policy and the CSV export.
                  </p>
                </Link>

                <Link
                  href="/admin/audit"
                  className="p-4 rounded-2xl border border-gray-200 hover:border-ncc-dark-blue hover:bg-gray-50 transition-colors"
                >
                  <p className="font-bold text-sm text-gray-900">Audit history</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Every change to a session, a mark, a leave or the policy.
                  </p>
                </Link>
              </div>
            </div>

            {/* Attendance History & Past Sessions */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
              <h3 className="font-heading font-black text-xl text-gray-900 mb-4">
                Recorded Attendance Sessions
              </h3>
              {sessions.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div>
                        <h4 className="font-bold text-sm text-gray-900">{s.title}</h4>
                        <p className="text-xs text-gray-500">
                          {formatCalendarDate(s.date)} • Type: {s.type}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                          {s.attendances?.length || 0} Attended
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-6 text-center">
                  No sessions recorded yet.
                </p>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: STUDY MATERIALS MANAGEMENT */}
        {activeTab === "materials" && (
          <div className="space-y-8">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
              <h2 className="font-heading font-black text-2xl text-gray-900 border-b pb-4 mb-6">
                Upload & Categorize Study Materials
              </h2>

              <form onSubmit={handleCreateMaterial} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Document Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Weapon Training .22 Rifle Stripping Guide"
                      value={materialForm.title}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, title: e.target.value })
                      }
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Category *
                    </label>
                    <select
                      value={materialForm.category}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, category: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
                    >
                      <option value="Drill">Drill</option>
                      <option value="Weapon Training">Weapon Training</option>
                      <option value="Map Reading">Map Reading</option>
                      <option value="Leadership">Leadership</option>
                      <option value="Social Service">Social Service</option>
                      <option value="Certificate A">Certificate A</option>
                      <option value="Certificate B">Certificate B</option>
                      <option value="Certificate C">Certificate C</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      File Download URL / Path *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="/study/NCC_File_Name.pdf or Cloud Storage Link"
                      value={materialForm.fileUrl}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, fileUrl: e.target.value })
                      }
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Format
                    </label>
                    <select
                      value={materialForm.fileType}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, fileType: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
                    >
                      <option value="PDF">PDF</option>
                      <option value="DOCX">DOCX</option>
                      <option value="PPT">PPT</option>
                      <option value="IMAGE">IMAGE</option>
                      <option value="VIDEO">VIDEO</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Description (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Brief overview of contents..."
                      value={materialForm.description}
                      onChange={(e) =>
                        setMaterialForm({
                          ...materialForm,
                          description: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 resize-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-ncc-dark-blue hover:bg-ncc-dark-blue/90 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Add Material Resource
                </button>
              </form>
            </div>

            {/* Existing Materials List */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
              <h3 className="font-heading font-black text-xl text-gray-900 mb-4">
                Active Catalog ({materials.length})
              </h3>
              {materials.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {materials.map((m) => (
                    <div
                      key={m.id}
                      className="py-3 flex items-center justify-between gap-4"
                    >
                      <div>
                        <h4 className="font-bold text-sm text-gray-900">{m.title}</h4>
                        <p className="text-xs text-gray-500">
                          {m.category} • {m.fileType}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteMaterial(m.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-6 text-center">
                  No custom uploaded materials yet. Default syllabus files are active.
                </p>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: NOTICEBOARD & ANNOUNCEMENTS */}
        {activeTab === "announcements" && (
          <div className="space-y-8">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
              <h2 className="font-heading font-black text-2xl text-gray-900 border-b pb-4 mb-6">
                Post Unit Announcement
              </h2>

              <form onSubmit={handleCreateAnnouncement} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Announcement Headline *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mandatory Drill Parade for CATC Preparations"
                    value={announcementForm.title}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        title: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Details / Instructions *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Provide uniform instructions, timings, venue..."
                    value={announcementForm.content}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        content: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-ncc-red hover:bg-ncc-red-light text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center gap-1.5"
                >
                  <Bell className="w-4 h-4" /> Broadcast Notice
                </button>
              </form>
            </div>

            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
              <h3 className="font-heading font-black text-xl text-gray-900 mb-4">
                Active Broadcasts
              </h3>
              {announcements.length > 0 ? (
                <div className="space-y-3">
                  {announcements.map((a) => (
                    <div
                      key={a.id}
                      className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex items-start justify-between gap-4"
                    >
                      <div>
                        <h4 className="font-bold text-sm text-gray-900">{a.title}</h4>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                          {a.content}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteAnnouncement(a.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-6 text-center">
                  No active announcements.
                </p>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: CONTACT MESSAGES */}
        {activeTab === "messages" && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
            <h2 className="font-heading font-black text-2xl text-gray-900 border-b pb-4">
              Inquiries & Contact Submissions
            </h2>

            {messages.length > 0 ? (
              <div className="space-y-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className="p-5 rounded-2xl bg-gray-50 border border-gray-200 hover:border-ncc-dark-blue/30 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
                      <div>
                        <h4 className="font-bold text-sm text-gray-900">{m.subject}</h4>
                        <p className="text-xs text-gray-500">
                          From: <strong className="text-gray-700">{m.name}</strong> (
                          {m.email})
                        </p>
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {formatCalendarDate(m.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 bg-white p-3 rounded-xl border border-gray-100 leading-relaxed mt-2">
                      {m.message}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400 text-xs">
                <Mail className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No messages received yet.
              </div>
            )}
          </div>
        )}

        {/* TAB 7: ROSTER */}
        {activeTab === "roster" && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6">
              <div>
                <h2 className="font-heading font-black text-2xl text-gray-900">
                  Roster Import
                </h2>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">
                  The email address is the only authoritative field. A cadet
                  whose email is on the roster is approved automatically at
                  the next sign in.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-200 text-center">
              <FileSpreadsheet className="w-8 h-8 mx-auto mb-3 text-ncc-red" />
              <p className="text-xs text-gray-600 mb-4 max-w-md mx-auto">
                The roster manager imports the NCC roster, reports every problem
                by line number, keeps the cadet profiles in sync, searches the
                roster and deactivates a row without touching the account.
              </p>
              <Link
                href="/admin/roster"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-ncc-dark-blue hover:bg-ncc-navy text-white font-bold text-xs rounded-xl transition-all shadow-md"
              >
                <FileSpreadsheet className="w-4 h-4" /> Open the roster manager
              </Link>
            </div>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={deactivationTarget !== null}
        tone="danger"
        title="Deactivate this cadet account?"
        description={
          deactivationTarget
            ? `${deactivationTarget.name} (${deactivationTarget.email}) will not be able to sign in and will not be able to use the cadet portal any more.\n\nThe account is not deleted. The attendance history, the leave requests, the profile and the audit history stay in the database and keep their original owner.\n\nThe name, the email address and the other identifiers of the cadet are not changed.`
            : ""
        }
        confirmLabel="Deactivate account"
        busy={deactivationBusy}
        reason={{
          label: "Reason for the deactivation",
          placeholder:
            "For example: the cadet left the unit after the 2026 intake.",
          helper:
            "The reason is stored in the audit history. It needs at least 5 characters.",
          required: true,
          minLength: 5,
        }}
        onConfirm={handleDeactivateCadet}
        onCancel={() => {
          if (!deactivationBusy) {
            setDeactivationTarget(null);
          }
        }}
      />
    </div>
  );
}
