import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import LeaveQueueClient from "@/components/attendance/LeaveQueueClient";

export const metadata: Metadata = {
  title: "Leave Management | NCC MIT WPU",
  description: "Review and decide the leave requests of the unit.",
};

export default async function AdminLeavePage() {
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

  return <LeaveQueueClient role="ADMIN" basePath="/admin/leave" />;
}
