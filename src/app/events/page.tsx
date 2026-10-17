import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Calendar, ChevronRight, Tag } from "lucide-react";
import prisma from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Events",
  description: "Explore events organised by the NCC Unit at MIT World Peace University, Pune.",
  openGraph: {
    title: "NCC MIT WPU Events & Activities",
    description: "Explore events organised by the NCC Unit at MIT World Peace University, Pune.",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "NCC MIT WPU Events",
    description: "Explore events organised by the NCC Unit at MIT World Peace University.",
  },
};

export default async function EventsPage() {
  let events: {
    id: string;
    title: string;
    slug: string;
    date: Date;
    description: string;
    thumbnail: string | null;
    status: string;
    category: string;
  }[] = [];

  try {
    events = await prisma.event.findMany({
      orderBy: { date: "desc" },
    });
  } catch {
    // fallback
  }

  // If no DB events, show hardcoded ones
  if (events.length === 0) {
    events = [
      {
        id: "1",
        title: "Trek to Korigad Fort",
        slug: "trek-to-korigad-fort",
        date: new Date("2026-10-03"),
        description: "An exhilarating trek to Korigad Fort in the Sahyadri range near Lonavala, Pune district.",
        thumbnail: null,
        status: "COMPLETED",
        category: "Adventure Training",
      },
      {
        id: "2",
        title: "Blood Donation Camp",
        slug: "blood-donation-camp",
        date: new Date("2026-10-09"),
        description: "MIT WPU NCC Unit organised a Blood Donation Camp embodying the spirit of social service.",
        thumbnail: null,
        status: "COMPLETED",
        category: "Social Service",
      },
    ];
  }

  const getEventImage = (slug: string) => {
    if (slug === "trek-to-korigad-fort") return "/images/trek/trek-1.jpg";
    if (slug === "blood-donation-camp") return "/images/blood-donation/bd-1.jpg";
    return "/images/logo/ncc-logo.png";
  };

  return (
    <>
      {/* Hero */}
      <section className="relative pt-20 sm:pt-28 pb-12 sm:pb-16 bg-gradient-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ncc-gold/10 border border-ncc-gold/30 rounded-full mb-3 sm:mb-4">
            <Calendar className="w-4 h-4 text-ncc-gold" />
            <span className="text-ncc-gold text-xs font-semibold tracking-wider uppercase">
              Events
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-heading font-bold text-white mb-3 sm:mb-4">
            Our <span className="text-ncc-gold">Events</span>
          </h1>
          <p className="text-white/70 text-sm sm:text-base max-w-2xl mx-auto">
            Discover the events and activities organised by the NCC Unit at MIT WPU
          </p>
        </div>
      </section>

      {/* Events List */}
      <section className="py-10 sm:py-16 bg-ncc-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {events.map((event) => (
              <Link key={event.id} href={`/events/${event.slug}`}>
                <div className="group bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 sm:hover:-translate-y-2 border border-gray-100 h-full">
                  <div className="relative h-40 sm:h-48 overflow-hidden">
                    <Image
                      src={event.thumbnail || getEventImage(event.slug)}
                      alt={event.title}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-700"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    <div className="absolute top-3 sm:top-4 left-3 sm:left-4 flex gap-2">
                      <span
                        className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                          event.status === "COMPLETED"
                            ? "bg-green-500 text-white"
                            : event.status === "UPCOMING"
                            ? "bg-ncc-gold text-ncc-dark-blue"
                            : "bg-gray-500 text-white"
                        }`}
                      >
                        {event.status === "COMPLETED" ? "✅ Completed" : event.status}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 sm:p-6">
                    <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                      <div className="flex items-center gap-1.5 text-ncc-blue text-xs sm:text-sm">
                        <Calendar className="w-4 h-4" />
                        {event.date.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                        <Tag className="w-3 h-3" />
                        <span className="truncate">{event.category}</span>
                      </div>
                    </div>
                    <h3 className="text-base sm:text-lg font-heading font-bold text-ncc-dark-blue mb-2 group-hover:text-ncc-red transition-colors">
                      {event.title}
                    </h3>
                    <p className="text-gray-600 text-xs sm:text-sm leading-relaxed line-clamp-3">
                      {event.description}
                    </p>
                    <div className="mt-3 sm:mt-4 flex items-center text-ncc-red font-semibold text-xs sm:text-sm gap-1 group-hover:gap-2 transition-all">
                      Read More <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
