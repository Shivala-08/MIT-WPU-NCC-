"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  FileText,
  Download,
  Search,
  Filter,
  Lock,
  BookOpen,
  FileCheck,
  Compass,
  Crosshair,
  Shield,
  Award,
  Users,
} from "lucide-react";
import { AnimatedSection } from "@/components/AnimatedSection";

interface Material {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileUrl: string;
  fileType: string;
  fileSize: number | null;
}

const CATEGORIES = [
  "All",
  "Drill",
  "Weapon Training",
  "Map Reading",
  "Leadership",
  "Social Service",
  "Certificate A",
  "Certificate B",
  "Certificate C",
];

const categoryIcons: Record<string, any> = {
  Drill: Shield,
  "Weapon Training": Crosshair,
  "Map Reading": Compass,
  Leadership: Users,
  "Social Service": Award,
  "Certificate A": FileCheck,
  "Certificate B": FileCheck,
  "Certificate C": Award,
};

export default function StudyMaterialsClient({
  initialMaterials,
}: {
  initialMaterials: Material[];
}) {
  const { data: session } = useSession();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMaterials = initialMaterials.filter((m) => {
    const matchesCategory =
      selectedCategory === "All" || m.category === selectedCategory;
    const matchesSearch =
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.description &&
        m.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      {/* Header Banner */}
      <div className="bg-ncc-dark-blue text-white py-12 sm:py-16 mb-8 sm:mb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ncc-gold/20 text-ncc-gold text-xs font-semibold tracking-wider uppercase mb-3 sm:mb-4">
            <BookOpen className="w-3.5 h-3.5" /> Cadet Learning Portal
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-heading font-black tracking-tight mb-3 sm:mb-4">
            NCC Study Material & Syllabi
          </h1>
          <p className="max-w-2xl mx-auto text-white/70 text-sm sm:text-base lg:text-lg">
            Access official training handbooks, drill guides, weapon training notes, and examination preparation papers.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Auth Notice if not logged in */}
        {!session && (
          <div className="mb-6 sm:mb-8 p-3 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-xs sm:text-sm">
                  Cadet Verification Required for Direct File Downloads
                </p>
                <p className="text-xs text-gray-600">
                  You are browsing public preview mode. Please sign in with your cadet account to download materials.
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="px-4 sm:px-5 py-2 sm:py-2.5 bg-ncc-dark-blue hover:bg-ncc-dark-blue/90 text-white font-semibold text-xs sm:text-sm rounded-xl transition-all shadow-sm shrink-0 touch-target"
            >
              Cadet Sign In
            </Link>
          </div>
        )}

        {/* Filter Controls */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-8 space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search Box */}
            <div className="relative w-full md:w-96">
              <Search className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search notes, subjects, exams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
              />
            </div>

            <div className="text-xs text-gray-500 font-medium">
              Showing {filteredMaterials.length} available resources
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isSelected
                      ? "bg-ncc-red text-white shadow-md shadow-ncc-red/20"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Materials Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredMaterials.map((item) => {
            const Icon = categoryIcons[item.category] || FileText;
            return (
              <AnimatedSection key={item.id}>
                <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col justify-between h-full group">
                  <div>
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-ncc-light-blue/15 text-ncc-dark-blue flex items-center justify-center">
                        <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-ncc-dark-blue" />
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-bold px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-gray-100 text-gray-600 uppercase tracking-wider">
                        {item.fileType || "PDF"}
                      </span>
                    </div>

                    <span className="text-xs font-semibold text-ncc-red block mb-1">
                      {item.category}
                    </span>
                    <h3 className="font-heading font-bold text-gray-900 text-sm sm:text-base mb-1 sm:mb-2 group-hover:text-ncc-red transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-gray-500 text-xs sm:text-sm line-clamp-2 leading-relaxed mb-4 sm:mb-6">
                      {item.description || "Official NCC instructional material approved by Directorate."}
                    </p>
                  </div>

                  <div className="pt-3 sm:pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {item.fileSize ? `${Math.round(item.fileSize / 1024)} KB` : "Verified Doc"}
                    </span>

                    {session ? (
                      <a
                        href={item.fileUrl}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-ncc-dark-blue hover:bg-ncc-red text-white text-xs font-semibold transition-all shadow-sm touch-target"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </a>
                    ) : (
                      <Link
                        href="/login"
                        className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-all touch-target"
                      >
                        <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Sign in
                      </Link>
                    )}
                  </div>
                </div>
              </AnimatedSection>
            );
          })}
        </div>
      </div>
    </div>
  );
}
