import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import { todayInIst } from "@/lib/calendar-date.mjs";
import AttendanceSessionsClient from "@/components/attendance/AttendanceSessionsClient";

export const metadata: Metadata = {
  title: "Attendance Sessions | NCC MIT WPU",
  description: "Create and manage the attendance sessions of the unit.",
};

export default async function AdminAttendancePage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!isApprovedAccount(user)) {
    redirect("/pending");
  }

  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <AttendanceSessionsClient
      role="ADMIN"
      basePath="/admin/attendance"
      today={todayInIst()}
    />
  );
}
