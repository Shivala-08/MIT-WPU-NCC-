"use client";

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
  Crosshair,
  BookOpen,
} from "lucide-react";
import {
  AnimatedSection,
  StaggerContainer,
  StaggerItem,
} from "@/components/AnimatedSection";

interface Officer {
  id: string;
  name: string;
  designation: string;
  rank: string | null;
  photoUrl: string | null;
  bio: string | null;
  order: number;
}

export default function AboutClient({ officers }: { officers: Officer[] }) {
  const nccAims = [
    {
      icon: Flag,
      title: "National Unity",
      desc: "Develop character, comradeship, discipline, a secular outlook, and ideals of selfless service amongst the youth.",
    },
    {
      icon: Shield,
      title: "Defence Preparedness",
      desc: "Create a human resource of organised, trained, and motivated youth to provide leadership in all walks of life including the Armed Forces.",
    },
    {
      icon: Heart,
      title: "Social Service",
      desc: "Provide a suitable environment to motivate the youth to take up a career in the Armed Forces and contribute to social welfare.",
    },
  ];

  const activities = [
    { icon: Crosshair, label: "Drill & Weapon Training" },
    { icon: Mountain, label: "Adventure Activities" },
    { icon: Heart, label: "Social Service" },
    { icon: BookOpen, label: "Academic Excellence" },
    { icon: Award, label: "Certificate Courses" },
    { icon: Users, label: "Community Development" },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative pt-28 pb-20 bg-gradient-hero overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <AnimatedSection>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ncc-gold/10 border border-ncc-gold/30 rounded-full mb-4">
              <Shield className="w-4 h-4 text-ncc-gold" />
              <span className="text-ncc-gold text-xs font-semibold tracking-wider uppercase">
                About Us
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-heading font-bold text-white mb-4">
              NCC MIT <span className="text-ncc-gold">World Peace University</span>
            </h1>
            <p className="text-white/70 max-w-2xl mx-auto text-lg">
              Building the nation&apos;s future — one cadet at a time
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* NCC History */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <AnimatedSection direction="left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ncc-red/10 rounded-full mb-4">
                <Star className="w-4 h-4 text-ncc-red" />
                <span className="text-ncc-red text-xs font-semibold tracking-wider uppercase">
                  Our Legacy
                </span>
              </div>
              <h2 className="text-3xl font-heading font-bold text-ncc-dark-blue mb-6">
                History of the <span className="text-ncc-red">National Cadet Corps</span>
              </h2>
              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>
                  The National Cadet Corps (NCC) was established on 15th July 1948
                  under the NCC Act of the Parliament of India. It is a voluntary
                  organisation that recruits cadets from high schools, colleges,
                  and universities all over India. The NCC is the largest uniformed
                  youth organisation in the world.
                </p>
                <p>
                  The NCC was formed on the recommendation of Pandit H. N. Kunzru
                  Committee in 1946. The NCC replaced the erstwhile University
                  Officers Training Corps (UOTC) which was established in 1942 by
                  the British government.
                </p>
                <p>
                  The NCC has its headquarters in New Delhi and is headed by a
                  Director General of three-star rank. It has 17 Directorates across
                  India and operates through various Group Headquarters and
                  Battalion/Squadron/Ship Units.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection direction="right" delay={0.2}>
              <div className="bg-ncc-cream rounded-2xl p-8 border border-ncc-gold/20">
                <h3 className="text-xl font-heading font-bold text-ncc-dark-blue mb-6">
                  NCC Flag Colours
                </h3>
                <div className="space-y-4">
                  {[
                    { color: "bg-red-600", label: "Red", desc: "Represents the Army wing" },
                    { color: "bg-blue-900", label: "Dark Blue", desc: "Represents the Naval wing" },
                    { color: "bg-sky-400", label: "Light Blue", desc: "Represents the Air wing" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-4">
                      <div className={`w-12 h-12 ${item.color} rounded-xl shadow-lg`} />
                      <div>
                        <p className="font-semibold text-ncc-dark-blue">{item.label}</p>
                        <p className="text-sm text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 bg-ncc-gold/10 rounded-xl border border-ncc-gold/20">
                  <p className="text-sm font-medium text-ncc-dark-blue">
                    <strong>Motto:</strong> &quot;Unity and Discipline&quot; (एकता और अनुशासन)
                  </p>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* NCC Aims */}
      <section className="py-20 bg-ncc-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-3xl font-heading font-bold text-ncc-dark-blue">
              Aims of the <span className="text-ncc-red">NCC</span>
            </h2>
          </AnimatedSection>

          <StaggerContainer className="grid md:grid-cols-3 gap-8">
            {nccAims.map((aim) => (
              <StaggerItem key={aim.title}>
                <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100 h-full">
                  <div className="w-14 h-14 bg-ncc-red/10 rounded-2xl flex items-center justify-center mb-6">
                    <aim.icon className="w-7 h-7 text-ncc-red" />
                  </div>
                  <h3 className="text-xl font-heading font-bold text-ncc-dark-blue mb-3">
                    {aim.title}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{aim.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* MIT WPU NCC Unit */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <div className="relative w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden border-2 border-ncc-gold shadow-md">
              <Image
                src="/images/logo/ncc-logo.png"
                alt="MIT WPU NCC Unit Official Emblem"
                fill
                className="object-cover"
              />
            </div>
            <h2 className="text-3xl font-heading font-bold text-ncc-dark-blue">
              MIT WPU <span className="text-ncc-red">NCC Unit</span>
            </h2>
            <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
              Our unit at MIT World Peace University, Pune, is part of the Pune
              Group NCC and operates under the NCC Directorate, Maharashtra.
            </p>
          </AnimatedSection>

          <StaggerContainer className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {activities.map(({ icon: Icon, label }) => (
              <StaggerItem key={label}>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-ncc-red/5 transition-colors border border-gray-100 hover:border-ncc-red/20">
                  <div className="w-10 h-10 bg-ncc-red/10 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-ncc-red" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* Officers Section */}
      <section className="py-20 bg-gradient-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-3xl font-heading font-bold text-white">
              Our <span className="text-ncc-gold">Officers</span>
            </h2>
            <p className="text-white/60 mt-4 max-w-xl mx-auto">
              The dedicated officers leading the MIT WPU NCC Unit
            </p>
          </AnimatedSection>

          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(officers.length > 0
              ? officers
              : [
                  { id: "1", name: "Lt. Col. [Name]", designation: "ANO", rank: "Lieutenant Colonel", photoUrl: null, bio: "Associate NCC Officer", order: 1 },
                  { id: "2", name: "Capt. [Name]", designation: "CO", rank: "Captain", photoUrl: null, bio: "Company Commander", order: 2 },
                  { id: "3", name: "SUO [Name]", designation: "SUO", rank: "Senior Under Officer", photoUrl: null, bio: "Senior Under Officer", order: 3 },
                  { id: "4", name: "JUO [Name]", designation: "JUO", rank: "Junior Under Officer", photoUrl: null, bio: "Junior Under Officer", order: 4 },
                ]
            ).map((officer) => (
              <StaggerItem key={officer.id}>
                <div className="glass-dark rounded-2xl p-6 text-center hover:border-ncc-gold/30 transition-colors">
                  <div className="relative w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden border-2 border-ncc-gold/40 bg-ncc-navy">
                    {officer.photoUrl ? (
                      <Image
                        src={officer.photoUrl}
                        alt={officer.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Users className="w-10 h-10 text-ncc-gold/40" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-white font-heading font-bold text-lg">
                    {officer.name}
                  </h3>
                  <p className="text-ncc-gold text-sm font-medium mt-1">
                    {officer.designation}
                  </p>
                  {officer.rank && (
                    <p className="text-white/50 text-xs mt-1">{officer.rank}</p>
                  )}
                  {officer.bio && (
                    <p className="text-white/40 text-xs mt-3 leading-relaxed">
                      {officer.bio}
                    </p>
                  )}
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>

          <AnimatedSection className="text-center mt-8">
            <p className="text-white/40 text-sm">
              Officer details can be updated from the Admin Dashboard
            </p>
          </AnimatedSection>
        </div>
      </section>
    </>
  );
}
