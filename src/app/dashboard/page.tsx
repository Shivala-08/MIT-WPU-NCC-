import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { USER_OMIT } from "@/lib/user-fields.mjs";
import { readPolicy } from "@/lib/attendance-policy.mjs";
import { calculateAttendance } from "@/lib/attendance-calculator";
import CadetDashboardClient from "./CadetDashboardClient";

export const metadata: Metadata = {
  title: "Cadet Dashboard | NCC MIT WPU",
  description: "Personal training record, attendance tracker, and study materials for enrolled cadets.",
  openGraph: {
    title: "My NCC Dashboard - MIT WPU",
    description: "Personal training record, attendance tracker, and study materials for enrolled cadets.",
    type: "website",
    locale: "en_IN",
  },
};

export default async function DashboardPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!isApprovedAccount(user)) {
    redirect("/pending");
  }

  // The role comes from the database, never from the session token.
  if (user.role === "ADMIN") {
    redirect("/admin");
  }

  if (user.role === "OFFICER") {
    redirect("/officer");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    omit: USER_OMIT,
    include: {
      cadetProfile: true,
      attendances: {
        include: {
          session: true,
        },
        orderBy: {
          session: {
            date: "desc",
          },
        },
      },
    },
  });

  if (!dbUser) {
    redirect("/login");
  }

  const announcements = await prisma.announcement.findMany({
    where: { isActive: true },
    orderBy: { priority: "desc" },
    take: 5,
  });

  const [sessions, policy] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { id: true, type: true, date: true, status: true },
      orderBy: { date: "desc" },
      take: 500,
    }),
    readPolicy(prisma),
  ]);

  const summary = calculateAttendance({
    sessions,
    records: dbUser.attendances.map((record) => ({
      sessionId: record.sessionId,
      userId: record.userId,
      status: record.status,
    })),
    policy,
  });

  return (
    <CadetDashboardClient
      user={dbUser}
      announcements={announcements}
      summary={summary}
    />
  );
}
