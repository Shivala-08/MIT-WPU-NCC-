import { Metadata } from "next";
import Link from "next/link";
import {
  Shield,
  Crosshair,
  Tent,
  HeartHandshake,
  Compass,
  Award,
  ChevronRight,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { AnimatedSection } from "@/components/AnimatedSection";

export const metadata: Metadata = {
  title: "Activities & Training | NCC MIT WPU",
  description:
    "Explore training modules of the NCC Unit at MIT World Peace University: Drill, Firing, Camps, Adventure, Social Service, and Certificate examinations.",
  openGraph: {
    title: "NCC MIT WPU Activities & Training Curriculum",
    description:
      "Explore training modules: Drill, Firing, Camps, Adventure, Social Service, and Certificate exams.",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "NCC MIT WPU Activities & Training",
    description: "Training modules: Drill, Firing, Camps, Adventure, Social Service.",
  },
};

const activities = [
  {
    id: "drill",
    title: "Foot & Arms Drill",
    icon: Shield,
    badge: "Discipline Foundation",
    color: "from-blue-600 to-indigo-800",
    description:
      "Drill is the bedrock of military discipline. Cadets master precise movements, squad formations, rifle handling, and ceremonial parades that cultivate prompt obedience and esprit de corps.",
    highlights: [
      "Foot Drill without arms & with arms (SLR & .22 Deluxe Rifle)",
      "Ceremonial Parades on Independence Day & Republic Day",
      "Words of Command & Squad Drill leadership",
      "Sentry and Guard of Honour protocols",
    ],
  },
  {
    id: "firing",
    title: "Weapon Training & Firing",
    icon: Crosshair,
    badge: "Marksmanship",
    color: "from-red-600 to-rose-900",
    description:
      "Cadets receive comprehensive safety training, weapon stripping and assembling, aiming principles, and live target practice at firing ranges under military supervision.",
    highlights: [
      "Handling .22 Deluxe Rifle, 7.62mm SLR, and INSAS Rifles",
      "Stripping, assembling, and cleaning of weapons",
      "Trigger operation, holding, and sighting (HAT principles)",
      "Inter-battalion shooting competitions & IDSSC selections",
    ],
  },
  {
    id: "camps",
    title: "Annual & National Camps",
    icon: Tent,
    badge: "Field Experience",
    color: "from-emerald-600 to-teal-800",
    description:
      "Camps offer immersive field experiences, fostering national integration, self-reliance, and physical resilience through 10-12 days of intensive training away from home.",
    highlights: [
      "Combined Annual Training Camp (CATC)",
      "Republic Day Camp (RDC) at Rajpath / Kartavya Path, New Delhi",
      "Thal Sainik Camp (TSC) for competitive soldiering skills",
      "National Integration Camps (NIC) & Ek Bharat Shreshtha Bharat (EBSB)",
    ],
  },
  {
    id: "adventure",
    title: "Adventure & Outdoor Training",
    icon: Compass,
    badge: "Courage & Grit",
    color: "from-amber-600 to-orange-800",
    description:
      "Trekking, rock climbing, obstacle courses, and survival drills designed to test endurance, push mental limits, and instill fearlessness.",
    highlights: [
      "Sahyadri Mountain Treks (Korigad Fort, Sinhagad, Rajgad)",
      "Obstacle Course Training (10 Standard Military Obstacles)",
      "Parasailing, Para-jumping & Mountaineering expeditions",
      "Survival tactics and field shelter construction",
    ],
  },
  {
    id: "social-service",
    title: "Social Service & Community Development",
    icon: HeartHandshake,
    badge: "Selfless Service",
    color: "from-rose-600 to-pink-800",
    description:
      "Instilling social consciousness and empathy through active community engagement, disaster relief readiness, and health awareness drives.",
    highlights: [
      "Annual Blood Donation Camps saving hundreds of lives",
      "Swachh Bharat Abhiyan clean-up drives across Pune",
      "Tree plantation campaigns & environmental awareness",
      "Traffic control assistance and disaster response drills",
    ],
  },
  {
    id: "certificates",
    title: "Certification Exams (A, B & C)",
    icon: Award,
    badge: "Career Milestone",
    color: "from-purple-600 to-indigo-900",
    description:
      "The pinnacle of an NCC cadet's journey. NCC certificates unlock direct SSB interview entry without UPSC written exam, bonus marks in armed forces and police recruitment, and corporate preference.",
    highlights: [
      "'A' Certificate for Junior Division / Wing cadets",
      "'B' Certificate: Year 2 Senior Wing examination",
      "'C' Certificate: The highest award, granting direct SSB Commissioning entry",
      "Special weightage in State Police, Paramilitary, and CAPF recruitments",
    ],
  },
];

const certificatesBreakdown = [
  {
    grade: "Certificate A",
    eligibility: "Junior Wing / Division cadets after 1-2 years training",
    benefits: "Foundational credit, high school credits, basic bonus marks.",
    focus: "Basic drill, military history, national integration, first aid.",
  },
  {
    grade: "Certificate B",
    eligibility: "Senior Division / Wing cadets after attending at least 1 CATC",
    benefits: "Bonus marks in state police, CAPF jobs, priority in state civil services.",
    focus: "Weapon training, map reading, field craft & battle craft, leadership.",
  },
  {
    grade: "Certificate C (Gold Standard)",
    eligibility: "Cadets holding Certificate B who have completed 3rd year & minimum 2 camps",
    benefits: "Direct SSB Interview Call without written exam (NCC Special Entry Scheme - Army, Navy, Air Force).",
    focus: "Advanced tactical command, disaster management, advanced marksmanship, junior leadership.",
  },
];

export default function ActivitiesPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      {/* Header */}
      <section className="bg-ncc-dark-blue text-white py-12 sm:py-16 mb-8 sm:mb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ncc-gold/20 text-ncc-gold text-xs font-semibold tracking-wider uppercase mb-3 sm:mb-4">
            <Shield className="w-3.5 h-3.5" /> Character & Discipline
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-heading font-black tracking-tight mb-3 sm:mb-4">
            Activities & Training Curriculum
          </h1>
          <p className="max-w-3xl mx-auto text-white/70 text-sm sm:text-base lg:text-lg">
            Our training regimen shapes MIT WPU cadets into disciplined, compassionate, and patriotic leaders ready to serve the nation with honor.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16">
        {/* Activities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {activities.map((act) => {
            const Icon = act.icon;
            return (
              <AnimatedSection key={act.id}>
                <div className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-200 overflow-hidden flex flex-col h-full">
                  <div className={`p-6 bg-gradient-to-r ${act.color} text-white`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm">
                        {act.badge}
                      </span>
                    </div>
                    <h3 className="text-xl font-heading font-bold text-white mb-2">
                      {act.title}
                    </h3>
                  </div>

                  <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-gray-600 text-xs sm:text-sm leading-relaxed mb-4 sm:mb-6">
                        {act.description}
                      </p>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 sm:mb-3">
                        Training Highlights
                      </h4>
                      <ul className="space-y-1.5 sm:space-y-2 mb-4 sm:mb-6">
                        {act.highlights.map((h, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-gray-700">
                            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            );
          })}
        </div>

        {/* Certificate Breakdown Section */}
        <AnimatedSection>
          <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-12 border border-gray-200 shadow-sm">
            <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-8 lg:mb-10">
              <span className="text-ncc-red font-bold text-xs sm:text-sm tracking-widest uppercase">
                National Cadet Corps
              </span>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-heading font-black text-gray-900 mt-1 sm:mt-2">
                Certification Spectrum
              </h2>
              <p className="text-gray-600 text-xs sm:text-sm mt-1 sm:mt-2">
                Earning NCC certification is a distinguished privilege that directly elevates career opportunities in defense, civil services, and corporate roles.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:gap-6">
              {certificatesBreakdown.map((cert, index) => (
                <div
                  key={index}
                  className={`rounded-2xl p-4 sm:p-6 border transition-all ${
                    index === 2
                      ? "border-amber-400 bg-amber-50/40 relative shadow-md"
                      : "border-gray-200 bg-gray-50/50"
                  }`}
                >
                  {index === 2 && (
                    <span className="absolute -top-2.5 right-4 sm:right-6 bg-amber-500 text-white text-[10px] font-bold px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full uppercase tracking-wider shadow">
                      Elite Direct Entry
                    </span>
                  )}
                  <h3 className="font-heading font-bold text-base sm:text-lg text-gray-900 mb-2 sm:mb-3 flex items-center gap-2">
                    <Award className={`w-4 h-4 sm:w-5 sm:h-5 ${index === 2 ? "text-amber-600" : "text-ncc-dark-blue"}`} />
                    {cert.grade}
                  </h3>
                  <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
                    <div>
                      <span className="font-semibold text-gray-700 block">Eligibility:</span>
                      <p className="text-gray-600">{cert.eligibility}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700 block">Syllabus Scope:</span>
                      <p className="text-gray-600">{cert.focus}</p>
                    </div>
                    <div className="pt-2 border-t border-gray-200">
                      <span className="font-semibold text-ncc-red block">Key Benefit:</span>
                      <p className="text-gray-800 font-medium">{cert.benefits}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 sm:mt-8 lg:mt-10 p-4 sm:p-6 lg:p-8 bg-ncc-dark-blue text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
              <div>
                <h4 className="font-heading font-bold text-base sm:text-lg text-white">
                  Ready to start your cadet journey?
                </h4>
                <p className="text-white/70 text-xs sm:text-sm mt-1">
                  Admissions are open for first-year and second-year MIT WPU students.
                </p>
              </div>
              <div className="flex gap-3 sm:gap-4">
                <Link
                  href="/register"
                  className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-ncc-red hover:bg-ncc-red-light font-bold text-white transition-all shadow-lg hover:shadow-ncc-red/30 text-xs sm:text-sm shrink-0 touch-target"
                >
                  Register Now
                </Link>
                <Link
                  href="/study-materials"
                  className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-white/10 hover:bg-white/20 font-medium text-white transition-all text-xs sm:text-sm shrink-0 flex items-center gap-1.5 touch-target"
                >
                  <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Study Notes
                </Link>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
