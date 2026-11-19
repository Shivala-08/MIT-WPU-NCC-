import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { USER_OMIT } from "@/lib/user-fields.mjs";
import { eligibleCadetWhere } from "@/lib/attendance-eligibility.mjs";
import OfficerDashboardClient from "./OfficerDashboardClient";
import { redirect } from "next/navigation";

export default async function OfficerPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!isApprovedAccount(user)) {
    redirect("/pending");
  }

  if (user.role !== "ADMIN" && user.role !== "OFFICER") {
    redirect("/dashboard");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    omit: USER_OMIT,
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
    // The list of the cadets of the unit only holds the cadets that may take
    // part in the attendance. A cadet whose roster row is inactive is not
    // part of the unit any more, but its history stays in the database.
    where: eligibleCadetWhere(),
    omit: USER_OMIT,
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
