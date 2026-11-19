import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";

export default async function DashboardLayout({
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

  if (user.role === "ADMIN") {
    redirect("/admin");
  }

  if (user.role === "OFFICER") {
    redirect("/officer");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
