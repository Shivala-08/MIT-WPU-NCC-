import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { USER_PASSWORD_OMIT } from "@/lib/user-fields.mjs";
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

  // If admin logs in, give them direct access to admin panel
  if (user.role === "ADMIN") {
    redirect("/admin");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    omit: USER_PASSWORD_OMIT,
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

  return (
    <CadetDashboardClient
      user={dbUser}
      announcements={announcements}
    />
  );
}
