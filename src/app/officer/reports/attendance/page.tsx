import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import AttendanceReportsClient from "@/components/attendance/AttendanceReportsClient";

export const metadata: Metadata = {
  title: "Attendance Reports | NCC MIT WPU",
  description: "Read only attendance reports of the unit.",
};

export default async function OfficerAttendanceReportsPage() {
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
    <AttendanceReportsClient role={user.role === "ADMIN" ? "ADMIN" : "OFFICER"} />
  );
}
