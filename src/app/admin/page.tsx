import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { USER_OMIT } from "@/lib/user-fields.mjs";
import AdminClient from "./AdminClient";

export const metadata: Metadata = {
  title: "Admin Command Center | NCC MIT WPU",
  description: "Unit management, cadet roster, parade attendance system, and study materials.",
  openGraph: {
    title: "NCC MIT WPU Admin Command Center",
    description: "Unit management, cadet roster, parade attendance system, and study materials.",
    type: "website",
    locale: "en_IN",
  },
};

export default async function AdminPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!isApprovedAccount(user)) {
    redirect("/pending");
  }

  if (user.role !== "ADMIN") {
    redirect("/");
  }

  // Fetch all admin data
  const [cadets, sessions, materials, announcements, messages] =
    await Promise.all([
      prisma.user.findMany({
        where: { role: "CADET" },
        omit: USER_OMIT,
        include: {
          cadetProfile: true,
          attendances: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.attendanceSession.findMany({
        include: {
          attendances: {
            include: {
              user: {
                omit: USER_OMIT,
                include: { cadetProfile: true },
              },
            },
          },
        },
        orderBy: { date: "desc" },
      }),
      prisma.studyMaterial.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.announcement.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.contactMessage.findMany({
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const totalCadets = cadets.length;
  // A deactivated cadet is not an active cadet any more. It stays in the list
  // so that the administrator can see and reactivate it, but it is not
  // counted as a pending or an approved member of the unit.
  const activeCadets = cadets.filter((c) => !c.deactivatedAt);
  const pendingCount = activeCadets.filter(
    (c) => c.approvalStatus === "PENDING"
  ).length;
  const approvedCount = activeCadets.filter(
    (c) => c.approvalStatus === "APPROVED"
  ).length;
  const totalSessions = sessions.length;

  return (
    <AdminClient
      initialCadets={cadets}
      initialSessions={sessions}
      initialMaterials={materials}
      initialAnnouncements={announcements}
      initialMessages={messages}
      stats={{
        totalCadets,
        pendingCount,
        approvedCount,
        totalSessions,
      }}
    />
  );
}
