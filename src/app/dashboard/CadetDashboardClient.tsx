"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Shield,
  User,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  BookOpen,
  Award,
  AlertTriangle,
  LogOut,
  Bell,
  ChevronRight,
  TrendingUp,
  FileText,
} from "lucide-react";

interface CadetDashboardProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    cadetProfile?: {
      fullName: string;
      regiNumber: string | null;
      wing: string;
      division: string | null;
      year: string;
      branch: string;
      prn: string | null;
      bloodGroup: string;
      status: string;
    } | null;
    attendances: {
      id: string;
      status: string;
      createdAt: string | Date;
      session: {
        title: string;
        type: string;
        date: string | Date;
        startTime: string | null;
        endTime: string | null;
      };
    }[];
  };
  announcements: {
    id: string;
    title: string;
    content: string;
    createdAt: string | Date;
  }[];
}

export default function CadetDashboardClient({
  user,
  announcements,
}: CadetDashboardProps) {
  const profile = user.cadetProfile;
  const attendances = user.attendances || [];

  const totalSessions = attendances.length;
  const presentCount = attendances.filter(
    (a) => a.status === "PRESENT" || a.status === "ON_DUTY"
  ).length;
  const absentCount = attendances.filter((a) => a.status === "ABSENT").length;
  const leaveCount = attendances.filter((a) => a.status === "LEAVE").length;

  const attendanceRate =
    totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 100;
  const isBelowCriteria = totalSessions > 0 && attendanceRate < 75;

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Top Header Card */}
        <div className="bg-ncc-dark-blue text-white rounded-3xl p-6 sm:p-10 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-ncc-red/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border-2 border-ncc-gold flex items-center justify-center text-ncc-gold shrink-0">
                <Shield className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl sm:text-3xl font-heading font-black">
                    {profile?.fullName || user.name}
                  </h1>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      profile?.status === "APPROVED"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {profile?.status || "CADET"}
                  </span>
                </div>
                <p className="text-white/70 text-xs sm:text-sm">
                  {profile?.wing || "Army"} Wing • {profile?.division || "SD"} •{" "}
                  {profile?.branch || "Engineering"} ({profile?.year || "Cadet"})
                </p>
                <p className="text-white/50 text-xs mt-0.5">
                  Regt No: {profile?.regiNumber || "Pending Allotment"} | PRN:{" "}
                  {profile?.prn || "N/A"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Link
                href="/study-materials"
                className="flex-1 md:flex-initial px-4 py-2.5 bg-ncc-red hover:bg-ncc-red-light text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-md text-center flex items-center justify-center gap-2"
              >
                <BookOpen className="w-4 h-4" /> Study Notes
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium rounded-xl transition-all flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Attendance Statistics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Attendance Rate
              </p>
              <h3
                className={`text-3xl font-heading font-black mt-2 ${
                  isBelowCriteria ? "text-amber-600" : "text-ncc-dark-blue"
                }`}
              >
                {attendanceRate}%
              </h3>
              <p className="text-[11px] text-gray-500 mt-1">
                {isBelowCriteria ? "Needs ≥ 75% for exam" : "Eligible for 'B' & 'C' exam"}
              </p>
            </div>
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isBelowCriteria
                  ? "bg-amber-100 text-amber-700"
                  : "bg-ncc-light-blue/20 text-ncc-dark-blue"
              }`}
            >
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Total Parades Logged
              </p>
              <h3 className="text-3xl font-heading font-black text-gray-900 mt-2">
                {totalSessions}
              </h3>
              <p className="text-[11px] text-gray-500 mt-1">
                Scheduled training sessions
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Present / On Duty
              </p>
              <h3 className="text-3xl font-heading font-black text-emerald-600 mt-2">
                {presentCount}
              </h3>
              <p className="text-[11px] text-gray-500 mt-1">
                Successful attendances
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Absences / Leave
              </p>
              <h3 className="text-3xl font-heading font-black text-red-600 mt-2">
                {absentCount + leaveCount}
              </h3>
              <p className="text-[11px] text-gray-500 mt-1">
                {absentCount} Unexcused, {leaveCount} Leave
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <XCircle className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* 75% Warning Alert if applicable */}
        {isBelowCriteria && (
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-300 flex items-center gap-3 text-amber-900">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
            <div>
              <h4 className="font-bold text-sm">Attendance Below 75% Threshold</h4>
              <p className="text-xs mt-0.5 text-amber-800">
                NCC Directorate rules require a minimum of 75% overall parade attendance to be eligible for Certificate &apos;B&apos; and &apos;C&apos; examination endorsement. Please report to your Senior Under Officer.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Attendance History Table */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-heading font-bold text-lg text-gray-900">
                  Parade & Session History
                </h2>
                <p className="text-gray-500 text-xs">
                  Official log verified by Unit ANO / Adjutant
                </p>
              </div>
              <span className="text-xs font-bold text-ncc-dark-blue px-3 py-1 bg-ncc-light-blue/15 rounded-full">
                {attendances.length} Records
              </span>
            </div>

            {attendances.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b text-gray-400 font-bold uppercase text-[11px] tracking-wider">
                      <th className="py-3 px-2">Session Title</th>
                      <th className="py-3 px-2">Type</th>
                      <th className="py-3 px-2">Date</th>
                      <th className="py-3 px-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {attendances.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3.5 px-2 font-medium text-gray-900">
                          {item.session.title}
                        </td>
                        <td className="py-3.5 px-2 text-gray-600">
                          <span className="px-2 py-0.5 rounded bg-gray-100 text-xs font-semibold">
                            {item.session.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-gray-500 text-xs">
                          {new Date(item.session.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold inline-block ${
                              item.status === "PRESENT"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.status === "ON_DUTY"
                                ? "bg-blue-100 text-blue-800"
                                : item.status === "LEAVE"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {item.status.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-700">No session attendance recorded yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Once your unit officers log parades, your attendance roll will appear here.
                </p>
              </div>
            )}
          </div>

          {/* Unit Noticeboard */}
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-ncc-red" />
                <h3 className="font-heading font-bold text-gray-900 text-base">
                  Unit Noticeboard
                </h3>
              </div>

              {announcements.length > 0 ? (
                <div className="space-y-4">
                  {announcements.map((ann) => (
                    <div
                      key={ann.id}
                      className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80 hover:border-ncc-red/30 transition-all"
                    >
                      <h4 className="font-bold text-sm text-gray-900 mb-1">
                        {ann.title}
                      </h4>
                      <p className="text-xs text-gray-600 leading-relaxed mb-2">
                        {ann.content}
                      </p>
                      <span className="text-[10px] text-gray-400 font-medium block">
                        Posted on:{" "}
                        {new Date(ann.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 text-center py-6">
                  No active announcements today.
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-ncc-dark-blue text-white rounded-3xl p-6 shadow-sm">
              <h3 className="font-heading font-bold text-base mb-2">
                Cadet Quick Resources
              </h3>
              <p className="text-xs text-white/70 mb-4">
                Exam syllabi, weapon training manuals, and unit contacts.
              </p>
              <div className="space-y-2">
                <Link
                  href="/study-materials"
                  className="flex items-center justify-between p-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition-all"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-ncc-gold" /> Download Notes
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/60" />
                </Link>
                <Link
                  href="/activities"
                  className="flex items-center justify-between p-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-ncc-light-blue" /> Certificate Guide
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/60" />
                </Link>
                <Link
                  href="/contact"
                  className="flex items-center justify-between p-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition-all"
                >
                  <span className="flex items-center gap-2">
                    <User className="w-4 h-4 text-ncc-red" /> Contact Officers
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/60" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
