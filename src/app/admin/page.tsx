import { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import AdminClient from "./AdminClient";

export const metadata: Metadata = {
  title: "Admin Command Center | NCC MIT WPU",
  description: "Unit management, cadet roster, parade attendance system, and study materials.",
};

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  // Fetch all admin data
  const [cadets, sessions, materials, announcements, messages] =
    await Promise.all([
      prisma.user.findMany({
        where: { role: "CADET" },
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
  const pendingCount = cadets.filter(
    (c) => c.cadetProfile?.status === "PENDING"
  ).length;
  const approvedCount = cadets.filter(
    (c) => c.cadetProfile?.status === "APPROVED"
  ).length;
  const totalSessions = sessions.length;

  return (
    <AdminClient
      initialCadets={cadets as any}
      initialSessions={sessions as any}
      initialMaterials={materials as any}
      initialAnnouncements={announcements as any}
      initialMessages={messages as any}
      stats={{
        totalCadets,
        pendingCount,
        approvedCount,
        totalSessions,
      }}
    />
  );
}
