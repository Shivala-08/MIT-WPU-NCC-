import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import OfficerDashboardClient from "./OfficerDashboardClient";
import { redirect } from "next/navigation";

export default async function OfficerPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!["ADMIN", "OFFICER"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { cadetProfile: true },
  });

  if (!user) {
    redirect("/login");
  }

  const sessions = await prisma.attendanceSession.findMany({
    orderBy: { date: "desc" },
  });

  const approvedCadets = await prisma.user.findMany({
    where: {
      role: "CADET",
      cadetProfile: { status: "APPROVED" },
    },
    include: { cadetProfile: true },
    orderBy: { name: "asc" },
  });

  return (
    <OfficerDashboardClient
      user={user as any}
      sessions={sessions as any}
      approvedCadets={approvedCadets as any}
    />
  );
}