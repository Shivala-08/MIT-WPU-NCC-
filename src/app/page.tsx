import Link from "next/link";
import Image from "next/image";
import { Calendar, Users, Award, Mountain, Heart, ArrowRight, Megaphone } from "lucide-react";
import prisma from "@/lib/prisma";
import HomeClient from "./HomeClient";

export default async function HomePage() {
  // Fetch data
  let stats = { totalCadets: 150, totalEvents: 24, totalCamps: 8 };
  let announcements: { id: string; title: string; content: string }[] = [];
  let latestEvents: { id: string; title: string; slug: string; date: Date; description: string; thumbnail: string | null; status: string; category: string }[] = [];

  try {
    const dbStats = await prisma.siteStats.findFirst({ where: { id: "main" } });
    if (dbStats) stats = dbStats;

    announcements = await prisma.announcement.findMany({
      where: { isActive: true },
      orderBy: { priority: "desc" },
      take: 5,
    });

    latestEvents = await prisma.event.findMany({
      orderBy: { date: "desc" },
      take: 2,
    });
  } catch {
    // Database may not be seeded yet
  }

  return (
    <HomeClient
      stats={stats}
      announcements={announcements}
      latestEvents={latestEvents.map((e) => ({
        ...e,
        date: e.date.toISOString(),
      }))}
    />
  );
}
