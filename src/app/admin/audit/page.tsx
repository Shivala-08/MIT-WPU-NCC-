import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import AuditLogClient from "@/components/attendance/AuditLogClient";

export const metadata: Metadata = {
  title: "Audit History | NCC MIT WPU",
  description: "Review the audit trail of the attendance and leave operations.",
};

export default async function AdminAuditPage() {
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

  return <AuditLogClient />;
}
