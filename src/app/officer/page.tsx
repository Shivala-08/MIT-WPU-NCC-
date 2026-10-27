import { getSessionUser } from "@/lib/guard";
import prisma from "@/lib/prisma";
import OfficerDashboardClient from "./OfficerDashboardClient";
import { redirect } from "next/navigation";

export default async function OfficerPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN" && user.role !== "OFFICER") {
    redirect("/dashboard");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { cadetProfile: true },
  });

  if (!dbUser) {
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
      user={dbUser as any}
      sessions={sessions as any}
      approvedCadets={approvedCadets as any}
    />
  );
}