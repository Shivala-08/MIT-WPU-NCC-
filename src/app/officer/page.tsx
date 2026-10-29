import { getSessionUser } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { USER_PASSWORD_OMIT } from "@/lib/user-fields.mjs";
import OfficerDashboardClient from "./OfficerDashboardClient";
import { redirect } from "next/navigation";

export default async function OfficerPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (user.approvalStatus !== "APPROVED") {
    redirect("/pending");
  }

  if (user.role !== "ADMIN" && user.role !== "OFFICER") {
    redirect("/dashboard");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    omit: USER_PASSWORD_OMIT,
    include: { cadetProfile: true },
  });

  if (!dbUser) {
    redirect("/login");
  }

  const sessions = await prisma.attendanceSession.findMany({
    include: {
      attendances: {
        include: {
          user: {
            include: { cadetProfile: true },
          },
        },
      },
    },
    orderBy: { date: "desc" },
  });

  const approvedCadets = await prisma.user.findMany({
    where: {
      role: "CADET",
      approvalStatus: "APPROVED",
    },
    omit: USER_PASSWORD_OMIT,
    include: { cadetProfile: true },
    orderBy: { name: "asc" },
  });

  return (
    <OfficerDashboardClient
      user={dbUser}
      sessions={sessions}
      approvedCadets={approvedCadets}
    />
  );
}
