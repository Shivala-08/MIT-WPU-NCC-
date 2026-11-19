import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import AttendanceReportsClient from "@/components/attendance/AttendanceReportsClient";

export const metadata: Metadata = {
  title: "Attendance Reports | NCC MIT WPU",
  description: "Cadet wise and session wise attendance reports of the unit.",
};

export default async function AdminAttendanceReportsPage() {
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

  return <AttendanceReportsClient role="ADMIN" />;
}
