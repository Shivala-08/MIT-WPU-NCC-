import { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import CadetDashboardClient from "./CadetDashboardClient";

export const metadata: Metadata = {
  title: "Cadet Dashboard | NCC MIT WPU",
  description: "Personal training record, attendance tracker, and study materials for enrolled cadets.",
};

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // If admin logs in, give them direct access to admin panel
  if (session.user.role === "ADMIN") {
    redirect("/admin");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
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

  if (!user) {
    redirect("/login");
  }

  const announcements = await prisma.announcement.findMany({
    where: { isActive: true },
    orderBy: { priority: "desc" },
    take: 5,
  });

  return (
    <CadetDashboardClient
      user={user as any}
      announcements={announcements as any}
    />
  );
}
