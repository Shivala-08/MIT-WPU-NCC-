import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import SessionDetailClient from "@/components/attendance/SessionDetailClient";

export default async function OfficerAttendanceSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;

  return (
    <SessionDetailClient
      sessionId={id}
      role={user.role === "ADMIN" ? "ADMIN" : "OFFICER"}
      basePath="/officer/attendance"
    />
  );
}
