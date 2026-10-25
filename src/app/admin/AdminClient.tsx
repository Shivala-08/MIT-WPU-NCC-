"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";

import {
  Shield,
  Users,
  Calendar,
  BookOpen,
  Bell,
  Mail,
  
  Plus,
  Trash2,
  CheckCircle,
  Clock,
  Search,
  LogOut,
  FileSpreadsheet,
  Check,
  X,
  ExternalLink,
} from "lucide-react";

interface Cadet {
  id: string;
  name: string;
  email: string;
  cadetProfile: {
    fullName?: string;
    regiNumber?: string;
    wing?: string;
    division?: string;
    year?: string;
    branch?: string;
    prn?: string;
    phone?: string;
    bloodGroup?: string;
    gender?: string;
    status?: string;
    parentContact?: string;
  } | null;
  attendances: any[];
}

interface Session {
  id: string;
  title: string;
  type: string;
  date: string | Date;
  startTime?: string;
  endTime?: string;
  attendances: any[];
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

export default function AdminClient({
  initialCadets,
  initialSessions,
  initialMaterials,
  initialAnnouncements,
  initialMessages,
  stats,
}: AdminClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "overview" | "cadets" | "attendance" | "materials" | "announcements" | "messages"
  >("overview");

  // State collections
  const [cadets, setCadets] = useState(initialCadets);
  const [sessions, setSessions] = useState(initialSessions);
  const [materials, setMaterials] = useState(initialMaterials);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [messages] = useState(initialMessages);

  // Cadet filtering
  const [cadetSearch, setCadetSearch] = useState("");
  const [cadetWingFilter, setCadetWingFilter] = useState("ALL");
  const [cadetStatusFilter, setCadetStatusFilter] = useState("ALL");

  // Attendance creation form
  const [sessionForm, setSessionForm] = useState({
    title: "",
    type: "Parade",
    date: new Date().toISOString().split("T")[0],
    startTime: "06:30",
    endTime: "09:30",
  });
  const [attendanceMarks, setAttendanceMarks] = useState<
    Record<string, "PRESENT" | "ABSENT" | "ON_DUTY" | "LEAVE">
  >({});
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);

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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
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
        setCadets((prev) =>
          prev.map((c) =>
            c.id === userId
              ? {
                  ...c,
                  cadetProfile: c.cadetProfile
                    ? { ...c.cadetProfile, status }
                    : null,
                }
              : c
          )
        );
        showToast(`Cadet status updated to ${status}`);
      }
    } catch {
      showToast("Failed to update cadet status");
    }
  };

  const handleDeleteCadet = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this cadet profile?")) return;
    try {
      const res = await fetch(`/api/admin/cadets?userId=${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCadets((prev) => prev.filter((c) => c.id !== userId));
        showToast("Cadet record deleted");
      }
    } catch {
      showToast("Failed to delete cadet");
    }
  };

  const exportCadetsToExcel = () => {
    router.push("/api/admin/cadets/export");
    showToast("Excel spreadsheet downloaded successfully");
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
      cadetStatusFilter === "ALL" || p?.status === cadetStatusFilter;

    return matchesSearch && matchesWing && matchesStatus;
  });

  const approvedCadets = cadets.filter((c) => c.cadetProfile?.status === "APPROVED");

  // --- ATTENDANCE ACTIONS ---
  const handleMarkAllPresent = () => {
    const initialMarks: Record<string, "PRESENT" | "ABSENT" | "ON_DUTY" | "LEAVE"> = {};
    approvedCadets.forEach((c) => {
      initialMarks[c.id] = "PRESENT";
    });
    setAttendanceMarks(initialMarks);
    showToast("All approved cadets marked Present");
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (approvedCadets.length === 0) {
      alert("No approved cadets found to log attendance for.");
      return;
    }

    setIsSubmittingAttendance(true);
    const marksPayload = approvedCadets.map((c) => ({
      userId: c.id,
      status: attendanceMarks[c.id] || "PRESENT",
    }));

    try {
      const res = await fetch("/api/admin/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sessionForm,
          marks: marksPayload,
        }),
      });

      const resData = await res.json();
      if (res.ok) {
        setSessions([resData.session, ...sessions]);
        showToast("Attendance session recorded successfully!");
        setSessionForm({
          title: "",
          type: "Parade",
          date: new Date().toISOString().split("T")[0],
          startTime: "06:30",
          endTime: "09:30",
        });
        setAttendanceMarks({});
      } else {
        alert(resData.error || "Failed to log attendance");
      }
    } catch {
      alert("Error submitting session attendance");
    } finally {
      setIsSubmittingAttendance(false);
    }
  };

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
      }
    } catch {
      showToast("Error adding material");
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
      }
    } catch {
      showToast("Failed to delete");
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
      }
    } catch {
      showToast("Error posting announcement");
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
      }
    } catch {
      showToast("Failed to delete");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-ncc-dark-blue text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-ncc-gold/40 text-sm">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
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
            {[
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
              { id: "announcements", label: "Noticeboard", icon: Bell },
              { id: "messages", label: `Messages (${messages.length})`, icon: Mail },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
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
                            {new Date(s.date).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}{" "}
                            • {s.type}
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
              <button
                onClick={exportCadetsToExcel}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export to Excel (.xlsx)
              </button>
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
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              p?.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-800"
                                : p?.status === "PENDING"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {p?.status || "PENDING"}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {p?.status !== "APPROVED" && (
                              <button
                                onClick={() => handleCadetStatus(c.id, "APPROVED")}
                                title="Approve Cadet"
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 transition-all"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {p?.status !== "REJECTED" && (
                              <button
                                onClick={() => handleCadetStatus(c.id, "REJECTED")}
                                title="Reject Application"
                                className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-700 transition-all"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteCadet(c.id)}
                              title="Delete Cadet"
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-600 hover:text-white text-red-600 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
            {/* Create Session & Mark Attendance Form */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6 mb-6">
                <div>
                  <h2 className="font-heading font-black text-2xl text-gray-900">
                    Log Training Attendance
                  </h2>
                  <p className="text-gray-500 text-xs sm:text-sm mt-1">
                    Select drill, parade, or camp and mark rolls for all approved cadets
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  className="px-4 py-2 bg-ncc-dark-blue hover:bg-ncc-dark-blue/90 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4 text-ncc-gold" /> Bulk Mark All Present
                </button>
              </div>

              <form onSubmit={handleCreateSession} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Session / Parade Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Saturday Morning Foot Drill & Firing Practice"
                      value={sessionForm.title}
                      onChange={(e) =>
                        setSessionForm({ ...sessionForm, title: e.target.value })
                      }
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Session Type *
                    </label>
                    <select
                      value={sessionForm.type}
                      onChange={(e) =>
                        setSessionForm({ ...sessionForm, type: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
                    >
                      <option value="Parade">Parade Drill</option>
                      <option value="Weapon Firing">Weapon Firing</option>
                      <option value="Camp">Camp (CATC/TSC/RDC)</option>
                      <option value="Social Service">Social Service Event</option>
                      <option value="Lecture">Theory / Exam Lecture</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={sessionForm.date}
                      onChange={(e) =>
                        setSessionForm({ ...sessionForm, date: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
                    />
                  </div>
                </div>

                {/* Cadet Marking Roll */}
                <div className="border rounded-2xl p-4 bg-gray-50/50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                    Roll Call ({approvedCadets.length} Approved Cadets)
                  </h3>
                  {approvedCadets.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                      {approvedCadets.map((c) => {
                        const currentStatus = attendanceMarks[c.id] || "PRESENT";
                        return (
                          <div
                            key={c.id}
                            className="p-3 rounded-xl bg-white border border-gray-200 flex items-center justify-between"
                          >
                            <div>
                              <p className="font-bold text-xs text-gray-900">
                                {c.cadetProfile?.fullName || c.name}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {c.cadetProfile?.wing} • {c.cadetProfile?.regiNumber || "Reg No Pending"}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              {(["PRESENT", "ABSENT", "ON_DUTY", "LEAVE"] as const).map(
                                (st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() =>
                                      setAttendanceMarks((prev) => ({
                                        ...prev,
                                        [c.id]: st,
                                      }))
                                    }
                                    className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                                      currentStatus === st
                                        ? st === "PRESENT"
                                          ? "bg-emerald-600 text-white"
                                          : st === "ABSENT"
                                          ? "bg-red-600 text-white"
                                          : st === "ON_DUTY"
                                          ? "bg-blue-600 text-white"
                                          : "bg-amber-600 text-white"
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                  >
                                    {st === "ON_DUTY" ? "OD" : st[0]}
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 py-4 text-center">
                      No approved cadets found. Please approve pending cadet applications first.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAttendance || approvedCadets.length === 0}
                  className="px-6 py-3 rounded-xl bg-ncc-red hover:bg-ncc-red-light disabled:opacity-50 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2"
                >
                  {isSubmittingAttendance ? "Saving Roll..." : "Save Attendance Session"}
                </button>
              </form>
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
                          {new Date(s.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}{" "}
                          • Type: {s.type}
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
                {messages.map((m: any) => (
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
                        {new Date(m.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
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
      </main>
    </div>
  );
}
