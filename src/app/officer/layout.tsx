import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function OfficerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id || !session?.user?.role || !["ADMIN", "OFFICER"].includes(session.user.role)) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {children}
    </div>
  );
}