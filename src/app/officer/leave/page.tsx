import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import LeaveQueueClient from "@/components/attendance/LeaveQueueClient";

export const metadata: Metadata = {
  title: "Leave Requests | NCC MIT WPU",
  description: "Read only view of the leave requests of the unit.",
};

export default async function OfficerLeavePage() {
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
    <LeaveQueueClient
      role={user.role === "ADMIN" ? "ADMIN" : "OFFICER"}
      basePath="/officer/leave"
    />
  );
}
