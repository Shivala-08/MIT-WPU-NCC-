import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import { todayInIst } from "@/lib/calendar-date.mjs";
import AttendanceSessionsClient from "@/components/attendance/AttendanceSessionsClient";

export const metadata: Metadata = {
  title: "Attendance Sessions | NCC MIT WPU",
  description: "Open the attendance sessions of the unit and mark the roll.",
};

export default async function OfficerAttendancePage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!isApprovedAccount(user)) {
    redirect("/pending");
  }

  if (user.role !== "OFFICER" && user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <AttendanceSessionsClient
      role={user.role === "ADMIN" ? "ADMIN" : "OFFICER"}
      basePath="/officer/attendance"
      today={todayInIst()}
    />
  );
}
