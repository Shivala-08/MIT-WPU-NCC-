"use client";

import { useState } from "react";
import LightboxGallery from "@/components/LightboxGallery";
import { AnimatedSection } from "@/components/AnimatedSection";
import { Camera, Mountain, Heart, Layers } from "lucide-react";

interface GalleryImageItem {
  src: string;
  alt: string;
  caption?: string;
  category: string;
}

interface GalleryClientProps {
  allImages: GalleryImageItem[];
  trekImages: GalleryImageItem[];
  bloodImages: GalleryImageItem[];
}

export default function GalleryClient({
  allImages,
  trekImages,
  bloodImages,
}: GalleryClientProps) {
  const [activeTab, setActiveTab] = useState<"all" | "trek" | "blood">("all");

  const displayedImages =
    activeTab === "trek"
      ? trekImages
      : activeTab === "blood"
      ? bloodImages
      : allImages;

  const tabs = [
    { id: "all", label: "All Photos", icon: Layers, count: allImages.length },
    { id: "trek", label: "Korigad Trek", icon: Mountain, count: trekImages.length },
    { id: "blood", label: "Blood Donation Camp", icon: Heart, count: bloodImages.length },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      {/* Hero Header */}
      <div className="bg-ncc-dark-blue text-white py-16 mb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ncc-gold/20 text-ncc-gold text-xs font-semibold tracking-wider uppercase mb-4">
            <Camera className="w-3.5 h-3.5" /> Memories & Training
          </span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-heading font-black tracking-tight mb-4">
            Photo Gallery
          </h1>
          <p className="max-w-2xl mx-auto text-white/70 text-base sm:text-lg">
            Capturing the spirit of camaraderie, valor, and service across our camps, treks, and university activities.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-all shadow-sm ${
                  isActive
                    ? "bg-ncc-red text-white shadow-ncc-red/30"
                    : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-gray-500"}`} />
                <span>{tab.label}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Gallery Grid with Lightbox */}
        <AnimatedSection>
          {displayedImages.length > 0 ? (
            <LightboxGallery images={displayedImages} columns={3} />
          ) : (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 p-8">
              <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-800 mb-2">No photos available yet</h3>
              <p className="text-gray-500 text-sm">
                Photos for this category will appear here once added to the repository folder.
              </p>
            </div>
          )}
        </AnimatedSection>
      </div>
    </div>
  );
}
