"use client";

import Link from "next/link";
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  Target,
  Heart,
  Mountain,
  ChevronLeft,
  Award,
  Droplets,
  CheckCircle,
} from "lucide-react";
import { AnimatedSection, StaggerContainer, StaggerItem } from "@/components/AnimatedSection";
import LightboxGallery from "@/components/LightboxGallery";

interface EventDetailClientProps {
  event: {
    title: string;
    slug: string;
    date: string;
    status: string;
    category: string;
    description: string;
  };
  contentData: Record<string, unknown>;
  galleryImages: { src: string; alt: string; caption: string; category: string }[];
}

export default function EventDetailClient({
  event,
  contentData,
  galleryImages,
}: EventDetailClientProps) {
  const isTrek = event.slug === "trek-to-korigad-fort";
  const isBlood = event.slug === "blood-donation-camp";

  return (
    <>
      {/* Hero */}
      <section className="relative pt-20 sm:pt-28 pb-10 sm:pb-16 bg-gradient-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/events"
            className="inline-flex items-center gap-2 text-white/60 hover:text-white text-xs sm:text-sm mb-4 sm:mb-6 transition-colors touch-target"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Events
          </Link>
          <AnimatedSection>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <span className="px-2.5 py-1 text-xs font-bold bg-green-500 text-white rounded-full">
                ✅ Completed
              </span>
              <span className="px-2.5 py-1 text-xs font-medium bg-white/10 text-white/80 rounded-full border border-white/20">
                {event.category}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-heading font-bold text-white mb-3 sm:mb-4">
              {event.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-white/60 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-ncc-gold" />
                <span>
                  {new Date(event.date).toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
              {isTrek && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-ncc-gold" />
                  <span>Korigad Fort, Sahyadri Range, Pune</span>
                </div>
              )}
              {isBlood && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-ncc-gold" />
                  <span>MIT WPU Campus, Pune</span>
                </div>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Content */}
      <section className="py-10 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Overview */}
          <AnimatedSection>
            <h2 className="text-xl sm:text-2xl font-heading font-bold text-ncc-dark-blue mb-3 sm:mb-4">
              Overview
            </h2>
            <p className="text-gray-600 leading-relaxed text-sm sm:text-base lg:text-lg">
              {contentData.overview as string}
            </p>
          </AnimatedSection>

          {/* Trek specific content */}
          {isTrek && (
            <>
              <AnimatedSection className="mt-8 sm:mt-12">
                <h2 className="text-xl sm:text-2xl font-heading font-bold text-ncc-dark-blue mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
                  <Mountain className="w-5 h-5 sm:w-6 sm:h-6 text-ncc-red" />
                  About Korigad Fort
                </h2>
                <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                  {contentData.aboutFort as string}
                </p>
              </AnimatedSection>

              <AnimatedSection className="mt-8 sm:mt-12">
                <h2 className="text-xl sm:text-2xl font-heading font-bold text-ncc-dark-blue mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
                  <Target className="w-5 h-5 sm:w-6 sm:h-6 text-ncc-red" />
                  Objectives
                </h2>
                <div className="space-y-2 sm:space-y-3">
                  {(contentData.objectives as string[]).map((obj, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 sm:p-4 bg-ncc-cream rounded-xl"
                    >
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0 mt-0.5" />
                      <p className="text-gray-700 text-xs sm:text-sm">{obj}</p>
                    </div>
                  ))}
                </div>
              </AnimatedSection>

              <AnimatedSection className="mt-8 sm:mt-12">
                <h2 className="text-xl sm:text-2xl font-heading font-bold text-ncc-dark-blue mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
                  <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-ncc-red" />
                  Day Schedule
                </h2>
                <div className="space-y-0">
                  {(contentData.schedule as { time: string; activity: string }[]).map((item, i) => (
                    <div key={i} className="flex gap-3 sm:gap-4 group">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-ncc-red rounded-full border-2 border-white shadow" />
                        {i < (contentData.schedule as unknown[]).length - 1 && (
                          <div className="w-0.5 h-full bg-ncc-red/20 min-h-[32px] sm:min-h-[40px]" />
                        )}
                      </div>
                      <div className="pb-4 sm:pb-6">
                        <span className="text-ncc-red font-bold text-xs sm:text-sm">
                          {item.time}
                        </span>
                        <p className="text-gray-700 text-xs sm:text-sm mt-0.5 sm:mt-1">{item.activity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AnimatedSection>

              <AnimatedSection className="mt-8 sm:mt-12">
                <div className="bg-ncc-cream rounded-2xl p-5 sm:p-8 border border-ncc-gold/20 text-center">
                  <Users className="w-8 h-8 sm:w-10 sm:h-10 text-ncc-gold mx-auto mb-2 sm:mb-3" />
                  <p className="text-2xl sm:text-3xl font-heading font-black text-ncc-dark-blue">
                    {contentData.cadetsParticipated as number}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    Cadets Participated
                  </p>
                </div>
              </AnimatedSection>

              <AnimatedSection className="mt-8 sm:mt-12">
                <h2 className="text-xl sm:text-2xl font-heading font-bold text-ncc-dark-blue mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
                  <Award className="w-5 h-5 sm:w-6 sm:h-6 text-ncc-gold" />
                  Key Learnings
                </h2>
                <StaggerContainer className="space-y-2 sm:space-y-3">
                  {(contentData.keyLearnings as string[]).map((learning, i) => (
                    <StaggerItem key={i}>
                      <div className="flex items-start gap-3 p-3 sm:p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                        <span className="w-6 h-6 sm:w-7 sm:h-7 bg-ncc-gold/10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold text-ncc-gold shrink-0">
                          {i + 1}
                        </span>
                        <p className="text-gray-700 text-xs sm:text-sm">{learning}</p>
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              </AnimatedSection>
            </>
          )}

          {/* Blood Donation specific content */}
          {isBlood && (
            <>
              <AnimatedSection className="mt-8 sm:mt-12">
                <h2 className="text-xl sm:text-2xl font-heading font-bold text-ncc-dark-blue mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
                  <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-ncc-red" />
                  Purpose
                </h2>
                <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                  {contentData.purpose as string}
                </p>
                <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-ncc-red/5 rounded-xl border border-ncc-red/10">
                  <p className="text-ncc-red font-semibold text-center text-base sm:text-lg italic">
                    &quot;Blood Donation is Life Donation&quot;
                  </p>
                </div>
              </AnimatedSection>

              <AnimatedSection className="mt-8 sm:mt-12">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                  <div className="bg-ncc-cream rounded-2xl p-4 sm:p-6 text-center border border-ncc-gold/20">
                    <Heart className="w-6 h-6 sm:w-8 sm:h-8 text-ncc-red mx-auto mb-1 sm:mb-2" />
                    <p className="text-xs sm:text-sm text-gray-500">Organising Partner</p>
                    <p className="text-base sm:text-lg font-heading font-bold text-ncc-dark-blue mt-1">
                      {contentData.organisingPartner as string}
                    </p>
                  </div>
                  <div className="bg-ncc-cream rounded-2xl p-4 sm:p-6 text-center border border-ncc-gold/20">
                    <Users className="w-6 h-6 sm:w-8 sm:h-8 text-ncc-gold mx-auto mb-1 sm:mb-2" />
                    <p className="text-xs sm:text-sm text-gray-500">Total Donors</p>
                    <p className="text-2xl sm:text-3xl font-heading font-black text-ncc-dark-blue mt-1">
                      {contentData.totalDonors as number}
                    </p>
                  </div>
                  <div className="bg-ncc-cream rounded-2xl p-4 sm:p-6 text-center border border-ncc-gold/20">
                    <Droplets className="w-6 h-6 sm:w-8 sm:h-8 text-ncc-red mx-auto mb-1 sm:mb-2" />
                    <p className="text-xs sm:text-sm text-gray-500">Units Collected</p>
                    <p className="text-2xl sm:text-3xl font-heading font-black text-ncc-dark-blue mt-1">
                      {contentData.unitsCollected as number}
                    </p>
                  </div>
                </div>
              </AnimatedSection>

              {contentData.highlights && (
                <AnimatedSection className="mt-8 sm:mt-12">
                  <h2 className="text-xl sm:text-2xl font-heading font-bold text-ncc-dark-blue mb-4 sm:mb-6">
                    Highlights
                  </h2>
                  <div className="space-y-2 sm:space-y-3">
                    {(contentData.highlights as string[]).map((h, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 sm:p-4 bg-ncc-cream rounded-xl">
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0 mt-0.5" />
                        <p className="text-gray-700 text-xs sm:text-sm">{h}</p>
                      </div>
                    ))}
                  </div>
                </AnimatedSection>
              )}

              <AnimatedSection className="mt-8 sm:mt-12">
                <div className="bg-gradient-to-br from-ncc-cream to-white rounded-2xl p-5 sm:p-8 border border-ncc-gold/20">
                  <h3 className="text-base sm:text-xl font-heading font-bold text-ncc-dark-blue mb-3 sm:mb-4 flex items-center gap-2">
                    <Award className="w-4 h-4 sm:w-5 sm:h-5 text-ncc-gold" />
                    Appreciation
                  </h3>
                  <p className="text-gray-600 leading-relaxed italic text-xs sm:text-sm">
                    &quot;{contentData.appreciationMessage as string}&quot;
                  </p>
                </div>
              </AnimatedSection>
            </>
          )}

          {/* Photo Gallery */}
          {galleryImages.length > 0 && (
            <AnimatedSection className="mt-10 sm:mt-16">
              <h2 className="text-xl sm:text-2xl font-heading font-bold text-ncc-dark-blue mb-6 sm:mb-8">
                📸 Photo Gallery
              </h2>
              <LightboxGallery
                images={galleryImages.map((img) => ({
                  src: img.src,
                  alt: img.alt,
                  caption: img.caption,
                }))}
                columns={2}
              />
            </AnimatedSection>
          )}

          {galleryImages.length === 0 && (
            <AnimatedSection className="mt-10 sm:mt-16">
              <div className="text-center py-8 sm:py-12 bg-gray-50 rounded-2xl">
                <p className="text-gray-500 text-xs sm:text-sm">
                  📷 Photos will be displayed here. Add images to the <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs">/public/images/{isTrek ? "trek" : "blood-donation"}/</code> folder.
                </p>
              </div>
            </AnimatedSection>
          )}
        </div>
      </section>
    </>
  );
}
