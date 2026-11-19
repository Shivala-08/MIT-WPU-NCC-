"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Shield,
  Users,
  Calendar,
  CheckCircle2,
  LogOut,
  Plus,
  Download,
} from "lucide-react";
import React from "react";
import { formatCalendarDate } from "@/lib/calendar-date.mjs";

interface OfficerDashboardProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    cadetProfile?: {
      fullName: string;
      regiNumber: string | null;
      wing: string | null;
      division: string | null;
      year: string | null;
      branch: string | null;
      bloodGroup: string | null;
      gender?: string | null;
      status: string;
      prn?: string | null;
      phone?: string | null;
    } | null;
  };
  sessions: {
    id: string;
    title: string;
    type: string;
    date: string | Date;
    startTime: string | null;
    endTime: string | null;
    attendances: {
      id: string;
      status: string;
      userId: string;
      user: {
        id: string;
        name: string;
        cadetProfile: {
          fullName: string;
          regiNumber: string | null;
          wing: string | null;
        } | null;
      };
    }[];
  }[];
  approvedCadets: {
    id: string;
    name: string;
    email: string;
    cadetProfile: {
      fullName: string;
      regiNumber: string | null;
      wing: string | null;
      division: string | null;
      year: string | null;
      branch: string | null;
      bloodGroup: string | null;
      gender?: string | null;
      prn?: string | null;
      phone?: string | null;
    } | null;
  }[];
}

export default function OfficerDashboardClient({
  user,
  sessions,
  approvedCadets,
}: OfficerDashboardProps) {
  const profile = user.cadetProfile;
  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "cadets">("overview");
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-ncc-dark-blue text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-ncc-gold/40 text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

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
                Officer Dashboard
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/officer/attendance"
              className="text-xs text-white/80 hover:text-white flex items-center gap-1"
            >
              Sessions
            </Link>
            <Link
              href="/officer/leave"
              className="text-xs text-white/80 hover:text-white flex items-center gap-1"
            >
              Leave
            </Link>
            <Link
              href="/officer/reports/attendance"
              className="text-xs text-white/80 hover:text-white flex items-center gap-1"
            >
              Reports
            </Link>
            <Link
              href="/"
              target="_blank"
              className="text-xs text-white/80 hover:text-white flex items-center gap-1"
            >
              View Site
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

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-2 sm:space-x-8 overflow-x-auto py-2 scrollbar-none">
            {[
              { id: "overview", label: "Overview", icon: Shield },
              { id: "attendance", label: `Attendance (${sessions.length})`, icon: Calendar },
              { id: "cadets", label: `Cadets (${approvedCadets.length})`, icon: Users },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as "overview" | "attendance" | "cadets")}
                  className={`py-3 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-ncc-dark-blue text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {activeTab === "overview" && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Approved Cadets
                  </p>
                  <h3 className="text-3xl font-heading font-black text-ncc-dark-blue mt-2">
                    {approvedCadets.length}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Active on roll</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-ncc-dark-blue/10 text-ncc-dark-blue flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Sessions Logged
                  </p>
                  <h3 className="text-3xl font-heading font-black text-emerald-600 mt-2">
                    {sessions.length}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Training sessions</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Your Role
                  </p>
                  <h3 className="text-3xl font-heading font-black text-ncc-red mt-2">
                    {profile?.status === "APPROVED" ? "SUO/JUO" : "Officer"}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">{user.role}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-ncc-red flex items-center justify-center">
                  <Shield className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
                <h3 className="font-heading font-bold text-lg text-gray-900 mb-4">
                  Recent Attendance Sessions
                </h3>
                {sessions.length > 0 ? (
                  <div className="space-y-3">
                    {sessions.slice(0, 5).map((s) => (
                      <div
                        key={s.id}
                        className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between"
                      >
                        <div>
                          <h4 className="font-bold text-sm text-gray-900">{s.title}</h4>
                          <p className="text-xs text-gray-500">
                            {formatCalendarDate(s.date)} • {s.type} •{" "}
                            {s.attendances?.length ?? 0} cadets
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-6 text-center">No sessions logged yet.</p>
                )}
              </div>

              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
                <h3 className="font-heading font-bold text-lg text-gray-900 mb-4">
                  Quick Actions
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setActiveTab("attendance")}
                    className="w-full text-left p-4 rounded-2xl bg-gray-50 border border-gray-200 hover:border-ncc-red/30 hover:bg-ncc-red/5 transition-all flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-xl bg-ncc-red/10 text-ncc-red flex items-center justify-center">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">Log New Attendance</p>
                      <p className="text-xs text-gray-500">Create parade, drill, or camp session</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab("cadets")}
                    className="w-full text-left p-4 rounded-2xl bg-gray-50 border border-gray-200 hover:border-ncc-red/30 hover:bg-ncc-red/5 transition-all flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-xl bg-ncc-dark-blue/10 text-ncc-dark-blue flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">View Cadet Roster</p>
                      <p className="text-xs text-gray-500">Manage approved cadet list</p>
                    </div>
                  </button>
                  <Link
                    href="/admin"
                    className="w-full text-left p-4 rounded-2xl bg-gray-50 border border-gray-200 hover:border-ncc-gold/30 hover:bg-ncc-gold/5 transition-all flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-xl bg-ncc-gold/10 text-ncc-gold flex items-center justify-center">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">Full Admin Panel</p>
                      <p className="text-xs text-gray-500">Access complete admin controls</p>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "attendance" && (
          <div className="space-y-8">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
              <h2 className="font-heading font-black text-2xl text-gray-900">
                Attendance sessions
              </h2>
              <p className="text-gray-500 text-xs sm:text-sm mt-1">
                Create a session, open it, mark the roll and run the QR check-in.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link
                  href="/officer/attendance"
                  className="p-4 rounded-2xl border border-gray-200 hover:border-ncc-dark-blue hover:bg-gray-50 transition-colors"
                >
                  <p className="font-bold text-sm text-gray-900">
                    Attendance sessions
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Open the session, mark the roll and read out the fallback
                    code.
                  </p>
                </Link>

                <Link
                  href="/officer/reports/attendance"
                  className="p-4 rounded-2xl border border-gray-200 hover:border-ncc-dark-blue hover:bg-gray-50 transition-colors"
                >
                  <p className="font-bold text-sm text-gray-900">
                    Attendance reports
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    The attendance of the unit with the current calculation
                    rules.
                  </p>
                </Link>
              </div>
            </div>

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
                          {s.attendances?.length ?? 0} Attended
                        </span>
                        <Link
                          href={`/officer/attendance/sessions/${s.id}`}
                          className="px-3 py-1.5 text-xs font-semibold text-ncc-red hover:text-ncc-red-light transition-colors"
                        >
                          View Details
                        </Link>
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

        {activeTab === "cadets" && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
            <h2 className="font-heading font-black text-2xl text-gray-900">
              Approved Cadet Roster
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">Cadet Name</th>
                    <th className="py-3 px-3">Regt / PRN</th>
                    <th className="py-3 px-3">Wing & Year</th>
                    <th className="py-3 px-3">Phone & Email</th>
                    <th className="py-3 px-3">Blood Grp</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {approvedCadets.map((c) => {
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
                        <td className="py-3.5 px-3 text-right">
                          <button
                            onClick={() => {
                              // View cadet details
                            }}
                            className="p-1.5 rounded-lg bg-ncc-dark-blue/10 hover:bg-ncc-dark-blue hover:text-white text-ncc-dark-blue transition-all"
                            title="View Details"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}