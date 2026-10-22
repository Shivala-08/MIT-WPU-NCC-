import { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import EventDetailClient from "./EventDetailClient";
import { getImageData } from "@/lib/images";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  let event;
  try {
    event = await prisma.event.findUnique({ where: { slug } });
  } catch {
    // DB not ready
  }

  if (!event) {
    return { title: "Event Not Found" };
  }

  return {
    title: event.title,
    description: event.description,
    openGraph: {
      title: event.title,
      description: event.description,
      type: "article",
      locale: "en_IN",
      images: event.thumbnail
        ? [{ url: event.thumbnail, width: 1200, height: 630, alt: event.title }]
        : [
            {
              url: "/images/logo/ncc-logo.png",
              width: 1200,
              height: 630,
              alt: "NCC MIT WPU",
            },
          ],
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description: event.description,
    },
  };
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  let event;

  try {
    event = await prisma.event.findUnique({
      where: { slug },
      include: { images: true },
    });
  } catch {
    // DB not ready, use hardcoded
  }

  // Hardcoded fallback data
  if (!event) {
    if (slug === "trek-to-korigad-fort") {
      event = {
        id: "trek",
        title: "Trek to Korigad Fort",
        slug: "trek-to-korigad-fort",
        date: new Date("2026-10-03"),
        status: "COMPLETED",
        category: "Adventure Training",
        description: "An exhilarating trek to Korigad Fort in the Sahyadri range near Lonavala.",
        content: JSON.stringify({
          overview: "The MIT WPU NCC Unit organised a memorable trek to Korigad Fort on 3rd October 2026. Korigad, also known as Koraigad, is a majestic hill fort perched in the Sahyadri mountain range near Lonavala in Pune district.",
          aboutFort: "Korigad Fort, situated in the Sahyadri range near Lonavala, Pune district, is a historically significant hill fort dating back to the Maratha era. The fort stands at an elevation of about 929 metres.",
          objectives: [
            "Adventure Training – Building physical endurance and mental resilience",
            "Teamwork – Strengthening bonds between cadets",
            "Endurance – Testing and improving physical stamina",
            "Leadership – Providing opportunities for senior cadets to lead",
            "Environmental Awareness – Educating cadets about the Western Ghats",
          ],
          schedule: [
            { time: "05:30 AM", activity: "Assembly at MIT WPU campus" },
            { time: "06:00 AM", activity: "Departure by bus" },
            { time: "08:00 AM", activity: "Arrival at base village" },
            { time: "08:30 AM", activity: "Trek commenced" },
            { time: "10:30 AM", activity: "Reached the summit" },
            { time: "12:30 PM", activity: "Packed lunch break" },
            { time: "01:30 PM", activity: "Descent commenced" },
            { time: "03:30 PM", activity: "Departure from base village" },
            { time: "05:30 PM", activity: "Arrival at campus" },
          ],
          cadetsParticipated: 45,
          keyLearnings: [
            "Exceptional teamwork demonstrated on steep terrain",
            "Senior cadets effectively led their groups",
            "Importance of physical fitness reinforced",
            "Practical map reading and navigation skills gained",
            "Environmental awareness heightened",
          ],
        }),
        thumbnail: null,
        images: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else if (slug === "blood-donation-camp") {
      event = {
        id: "blood",
        title: "Blood Donation Camp",
        slug: "blood-donation-camp",
        date: new Date("2026-10-09"),
        status: "COMPLETED",
        category: "Social Service",
        description: "MIT WPU NCC Unit organised a Blood Donation Camp in collaboration with local blood banks.",
        content: JSON.stringify({
          overview: "The MIT WPU NCC Unit successfully organised a Blood Donation Camp on 9th October 2026 on the university campus.",
          purpose: "Blood donation is one of the most impactful forms of social service. This camp aimed to instil the value of selfless service.",
          organisingPartner: "Sasoon General Hospital Blood Bank, Pune",
          totalDonors: 62,
          unitsCollected: 58,
          appreciationMessage: "Heartfelt gratitude to all the brave donors who stepped forward. Your selfless act has the power to save up to three lives per donation.",
          highlights: [
            "Pre-donation health screening",
            "Awareness session on blood donation",
            "Post-donation refreshments",
            "Certificates of appreciation",
            "Blood group identification cards",
          ],
        }),
        thumbnail: null,
        images: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      notFound();
    }
  }

  // Get gallery images from filesystem
  let galleryImages: { src: string; alt: string; caption: string; category: string }[] = [];
  if (slug === "trek-to-korigad-fort") {
    galleryImages = getImageData("/images/trek", "Trek to Korigad Fort");
  } else if (slug === "blood-donation-camp") {
    galleryImages = getImageData("/images/blood-donation", "Blood Donation Camp");
  }

  const contentData = JSON.parse(event.content);

  return (
    <EventDetailClient
      event={{
        ...event,
        date: event.date.toISOString(),
      }}
      contentData={contentData}
      galleryImages={galleryImages}
    />
  );
}
