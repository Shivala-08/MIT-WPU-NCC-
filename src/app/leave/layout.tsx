import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";

export default async function LeaveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!isApprovedAccount(user)) {
    redirect("/pending");
  }

  if (user.role !== "CADET") {
    redirect("/dashboard");
  }

  return <div className="min-h-screen bg-gray-50">{children}</div>;
}
