"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Calendar,
  Users,
  Award,
  Mountain,
  Heart,
  ArrowRight,
  Megaphone,
  ChevronRight,
  Target,
  Shield,
  Flag,
} from "lucide-react";
import {
  AnimatedSection,
  StaggerContainer,
  StaggerItem,
} from "@/components/AnimatedSection";

interface HomeClientProps {
  stats: { totalCadets: number; totalEvents: number; totalCamps: number };
  announcements: { id: string; title: string; content: string }[];
  latestEvents: {
    id: string;
    title: string;
    slug: string;
    date: string;
    description: string;
    thumbnail: string | null;
    status: string;
    category: string;
  }[];
}

export default function HomeClient({
  stats,
  announcements,
  latestEvents,
}: HomeClientProps) {
  return (
    <>
      {/* ═══════ HERO SECTION ═══════ */}
      <section className="relative min-h-screen min-h-[100dvh] flex items-center justify-center overflow-hidden bg-gradient-hero">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-10 w-72 h-72 sm:w-96 sm:h-96 bg-ncc-red/5 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-72 h-72 sm:w-96 sm:h-96 bg-ncc-light-blue/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] bg-ncc-gold/3 rounded-full blur-3xl" />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="mb-6 sm:mb-8"
          >
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 md:w-36 md:h-36 mx-auto rounded-full overflow-hidden border-4 border-ncc-gold/60 shadow-2xl shadow-ncc-gold/20 animate-pulse-gold">
              <Image
                src="/images/logo/ncc-logo.png"
                alt="NCC MIT WPU Emblem"
                fill
                className="object-cover"
                priority
                unoptimized
              />
            </div>
          </motion.div>

          {/* Motto */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-ncc-gold/10 border border-ncc-gold/30 rounded-full mb-4 sm:mb-6">
              <Flag className="w-4 h-4 text-ncc-gold" />
              <span className="text-ncc-gold text-xs sm:text-sm font-semibold tracking-wider uppercase">
                National Cadet Corps
              </span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-heading font-black text-white mb-3 sm:mb-4 leading-tight"
          >
            Unity and{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-ncc-gold via-ncc-gold-light to-ncc-gold">
              Discipline
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.8 }}
            className="text-base sm:text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-3 font-light"
          >
            एकता और अनुशासन
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="text-sm sm:text-base md:text-lg text-white/60 max-w-3xl mx-auto mb-6 sm:mb-10"
          >
            MIT World Peace University NCC Unit — Moulding the youth of the
            nation into disciplined and patriotic citizens through military
            training, social service, and adventure activities.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.8 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
          >
            <Link
              href="/register"
              className="group px-6 sm:px-8 py-3.5 sm:py-4 bg-ncc-red hover:bg-ncc-red-dark text-white font-bold rounded-xl shadow-xl shadow-ncc-red/30 hover:shadow-ncc-red/50 transition-all duration-300 hover:scale-105 flex items-center gap-2 touch-target"
            >
              Register as Cadet
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/about"
              className="px-6 sm:px-8 py-3.5 sm:py-4 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl border border-white/20 hover:border-white/30 backdrop-blur-sm transition-all duration-300 touch-target"
            >
              Learn More
            </Link>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="w-5 h-8 sm:w-6 sm:h-10 border-2 border-white/30 rounded-full p-1">
            <motion.div
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-ncc-gold rounded-full mx-auto"
            />
          </div>
        </motion.div>
      </section>

      {/* ═══════ ANNOUNCEMENTS MARQUEE ═══════ */}
      {announcements.length > 0 && (
        <div className="bg-ncc-red text-white py-2 sm:py-3 overflow-hidden relative">
          <div className="flex items-center gap-3 sm:gap-4 animate-marquee whitespace-nowrap overflow-hidden">
            <Megaphone className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 ml-2 sm:ml-4" />
            {announcements.map((a) => (
              <span key={a.id} className="text-xs sm:text-sm font-medium px-2 sm:px-4">
                📢 {a.title}: {a.content}
              </span>
            ))}
            {/* Duplicate for seamless scroll */}
            {announcements.map((a) => (
              <span key={`dup-${a.id}`} className="text-xs sm:text-sm font-medium px-2 sm:px-4">
                📢 {a.title}: {a.content}
              </span>
            ))}
          </div>
          <style jsx>{`
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .animate-marquee {
              animation: marquee 30s linear infinite;
            }
          `}</style>
        </div>
      )}

      {/* ═══════ ABOUT SECTION ═══════ */}
      <section className="py-12 sm:py-16 lg:py-20 lg:py-28 bg-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">
            <AnimatedSection direction="left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ncc-red/10 rounded-full mb-3 sm:mb-4">
                <Shield className="w-4 h-4 text-ncc-red" />
                <span className="text-ncc-red text-xs font-semibold tracking-wider uppercase">
                  About NCC
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold text-ncc-dark-blue mb-4 sm:mb-6">
                Shaping Tomorrow&apos;s{" "}
                <span className="text-ncc-red">Leaders</span> Today
              </h2>
              <p className="text-gray-600 leading-relaxed text-sm sm:text-base mb-4">
                The National Cadet Corps (NCC) is the largest uniformed youth
                organisation in the world. At MIT World Peace University, our
                NCC unit is dedicated to developing character, comradeship,
                discipline, a secular outlook, the spirit of adventure, and
                ideals of selfless service among young cadets.
              </p>
              <p className="text-gray-600 leading-relaxed text-sm sm:text-base mb-6">
                Through rigorous military training, social service initiatives,
                adventure activities, and academic excellence, we prepare our
                cadets to become responsible citizens and future leaders of the
                nation.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {[
                  { icon: Target, label: "Leadership Training" },
                  { icon: Users, label: "Team Building" },
                  { icon: Shield, label: "Discipline" },
                  { icon: Heart, label: "Social Service" },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2.5 p-2.5 sm:p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-ncc-red/10 rounded-lg flex items-center justify-center">
                      <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-ncc-red" />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-gray-700 text-center">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </AnimatedSection>

            <AnimatedSection direction="right" delay={0.2}>
              <div className="relative">
                <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden shadow-2xl">
                  <Image
                    src="/images/logo/ncc-logo.png"
                    alt="NCC Cadets at MIT WPU"
                    fill
                    className="object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "/images/logo/logo.png";
                    }}
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
                {/* Floating card - hide on small screens */}
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -bottom-4 -left-4 sm:-bottom-6 sm:-left-6 bg-white p-4 sm:p-5 rounded-2xl shadow-2xl border border-gray-100 hidden sm:block"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-ncc-gold/10 rounded-xl flex items-center justify-center">
                      <Award className="w-5 h-5 sm:w-6 sm:h-6 text-ncc-gold" />
                    </div>
                    <div>
                      <p className="text-2xl sm:text-3xl font-heading font-black text-ncc-dark-blue">
                        {stats.totalCadets}+
                      </p>
                      <p className="text-xs text-gray-500">Active Cadets</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ═══════ STATS SECTION ═══════ */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <StaggerContainer className="grid grid-cols-1 gap-6 sm:gap-8">
            {[
              { value: stats.totalCadets, label: "Active Cadets", suffix: "+" },
              { value: stats.totalEvents, label: "Events Conducted", suffix: "+" },
              { value: stats.totalCamps, label: "Camps Attended", suffix: "+" },
            ].map((stat) => (
              <StaggerItem key={stat.label} className="sm:col-span-1">
                <div className="text-center glass-dark p-6 sm:p-8 rounded-2xl">
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-heading font-black text-ncc-gold mb-2">
                    {stat.value}{stat.suffix}
                  </div>
                  <p className="text-white/70 text-xs sm:text-sm font-medium tracking-wide uppercase">
                    {stat.label}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ═══════ LATEST EVENTS ═══════ */}
      <section className="py-12 sm:py-16 lg:py-20 bg-ncc-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-8 sm:mb-12 lg:mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ncc-blue/10 rounded-full mb-3 sm:mb-4">
              <Calendar className="w-4 h-4 text-ncc-blue" />
              <span className="text-ncc-blue text-xs font-semibold tracking-wider uppercase">
                Latest Events
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold text-ncc-dark-blue">
              Recent <span className="text-ncc-red">Activities</span>
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            {latestEvents.length > 0
              ? latestEvents.map((event, i) => (
                  <AnimatedSection key={event.id} delay={i * 0.15}>
                    <Link href={`/events/${event.slug}`}>
                      <div className="group bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 sm:hover:-translate-y-2 border border-gray-100">
                        <div className="relative h-48 sm:h-56 overflow-hidden">
                          <Image
                            src={
                              event.slug === "trek-to-korigad-fort"
                                ? "/images/trek/trek-1.jpg"
                                : "/images/blood-donation/bd-1.jpg"
                            }
                            alt={event.title}
                            fill
                            className="object-cover group-hover:scale-110 transition-transform duration-700"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = "/images/logo/ncc-logo.png";
                            }}
                            sizes="(max-width: 768px) 100vw, 50vw"
                          />
                          <div className="absolute top-3 sm:top-4 left-3 sm:left-4">
                            <span
                              className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                event.status === "COMPLETED"
                                  ? "bg-green-500 text-white"
                                  : "bg-ncc-gold text-ncc-dark-blue"
                              }`}
                            >
                              {event.status === "COMPLETED"
                                ? "✅ Completed"
                                : event.status}
                            </span>
                          </div>
                          <div className="absolute top-3 sm:top-4 right-3 sm:right-4">
                            <span className="px-2.5 py-1 text-xs font-medium bg-white/90 text-ncc-dark-blue rounded-full backdrop-blur-sm">
                              {event.category}
                            </span>
                          </div>
                        </div>
                        <div className="p-4 sm:p-6">
                          <div className="flex items-center gap-2 text-ncc-blue text-xs sm:text-sm font-medium mb-2 sm:mb-3">
                            <Calendar className="w-4 h-4" />
                            {new Date(event.date).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </div>
                          <h3 className="text-lg sm:text-xl font-heading font-bold text-ncc-dark-blue mb-2 sm:mb-3 group-hover:text-ncc-red transition-colors">
                            {event.title}
                          </h3>
                          <p className="text-gray-600 text-xs sm:text-sm leading-relaxed line-clamp-3">
                            {event.description}
                          </p>
                          <div className="mt-3 sm:mt-4 flex items-center text-ncc-red font-semibold text-xs sm:text-sm group-hover:gap-2 sm:group-hover:gap-3 gap-1 transition-all">
                            Read More
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    </Link>
                  </AnimatedSection>
                ))
              : [
                  {
                    title: "Trek to Korigad Fort",
                    slug: "trek-to-korigad-fort",
                    date: "2026-10-03",
                    description: "An exhilarating trek to Korigad Fort fostering adventure training and teamwork.",
                    category: "Adventure",
                    icon: Mountain,
                  },
                  {
                    title: "Blood Donation Camp",
                    slug: "blood-donation-camp",
                    date: "2026-10-09",
                    description: "MIT WPU NCC Unit organised a Blood Donation Camp embodying the spirit of service.",
                    category: "Social Service",
                    icon: Heart,
                  },
                ].map((event, i) => (
                  <AnimatedSection key={event.slug} delay={i * 0.15}>
                    <Link href={`/events/${event.slug}`}>
                      <div className="group bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 sm:hover:-translate-y-2 border border-gray-100 p-6 sm:p-8">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-ncc-red/10 rounded-2xl flex items-center justify-center mb-3 sm:mb-4">
                          <event.icon className="w-6 h-6 sm:w-7 sm:h-7 text-ncc-red" />
                        </div>
                        <span className="inline-block px-2.5 py-1 text-xs font-bold bg-green-500 text-white rounded-full mb-2 sm:mb-3">
                          ✅ Completed
                        </span>
                        <div className="flex items-center gap-2 text-ncc-blue text-xs sm:text-sm font-medium mb-2 sm:mb-3">
                          <Calendar className="w-4 h-4" />
                          {new Date(event.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </div>
                        <h3 className="text-lg sm:text-xl font-heading font-bold text-ncc-dark-blue mb-2 sm:mb-3 group-hover:text-ncc-red transition-colors">
                          {event.title}
                        </h3>
                        <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
                          {event.description}
                        </p>
                      </div>
                    </Link>
                  </AnimatedSection>
                ))}
          </div>

          <AnimatedSection className="text-center mt-8 sm:mt-12">
            <Link
              href="/events"
              className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-ncc-dark-blue hover:bg-ncc-navy text-white font-semibold rounded-xl transition-all duration-300 hover:scale-105 touch-target"
            >
              View All Events
              <ArrowRight className="w-5 h-5" />
            </Link>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══════ CTA SECTION ═══════ */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-ncc-red via-ncc-red-dark to-ncc-dark-blue relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.1%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')]" />
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <AnimatedSection>
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-heading font-bold text-white mb-4 sm:mb-6">
              Ready to Serve the Nation?
            </h2>
            <p className="text-white/80 text-base sm:text-lg mb-6 sm:mb-10 max-w-2xl mx-auto">
              Join the NCC at MIT World Peace University and embark on a journey
              of discipline, leadership, and selfless service. Shape your
              character and serve your nation.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/register"
                className="px-6 sm:px-8 py-3 sm:py-4 bg-white text-ncc-red font-bold rounded-xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 flex items-center gap-2 touch-target"
              >
                Register Now
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/contact"
                className="px-6 sm:px-8 py-3 sm:py-4 bg-transparent text-white font-semibold rounded-xl border-2 border-white/40 hover:border-white/70 hover:bg-white/10 transition-all duration-300 touch-target"
              >
                Contact Us
              </Link>
            </div>
          </AnimatedSection>
        </div>
      </section>
    </>
  );
}
