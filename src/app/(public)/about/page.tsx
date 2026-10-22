import { Metadata } from "next";
import Image from "next/image";
import {
  Shield,
  Target,
  Users,
  Award,
  Heart,
  Mountain,
  Flag,
  Star,
} from "lucide-react";
import prisma from "@/lib/prisma";
import AboutClient from "./AboutClient";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Learn about the NCC Unit at MIT World Peace University, Pune — its history, aims, officers, and mission to develop discipline and leadership among youth.",
  openGraph: {
    title: "About NCC MIT WPU - History, Mission & Officers",
    description:
      "Learn about the NCC Unit at MIT World Peace University, Pune — its history, aims, officers, and mission.",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "About NCC MIT WPU",
    description:
      "History, mission, and officers of the NCC unit at MIT World Peace University.",
  },
};

export default async function AboutPage() {
  let officers: {
    id: string;
    name: string;
    designation: string;
    rank: string | null;
    photoUrl: string | null;
    bio: string | null;
    order: number;
  }[] = [];

  try {
    officers = await prisma.officer.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  } catch {
    // DB not ready
  }

  return <AboutClient officers={officers} />;
}
