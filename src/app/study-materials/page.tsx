import { Metadata } from "next";
import prisma from "@/lib/prisma";
import StudyMaterialsClient from "./StudyMaterialsClient";

export const metadata: Metadata = {
  title: "Study Material | NCC MIT WPU",
  description:
    "Official NCC notes, drill manuals, weapon training handbooks, and Certificate A, B, and C exam papers for MIT WPU cadets.",
};

const defaultMaterials = [
  {
    id: "drill-manual-1",
    title: "Foot Drill & Word of Command Manual",
    description: "Comprehensive guide to squad drill without arms, saluting on the march, and standard words of command.",
    category: "Drill",
    fileUrl: "/study/NCC_Drill_Manual.pdf",
    fileType: "PDF",
    fileSize: 2450000,
  },
  {
    id: "drill-arms-2",
    title: "Arms Drill for .22 & 7.62mm Rifles",
    description: "Detailed protocols for shastrasalay, visarjan, salute with weapons, and sentry drill.",
    category: "Drill",
    fileUrl: "/study/NCC_Arms_Drill.pdf",
    fileType: "PDF",
    fileSize: 1840000,
  },
  {
    id: "wt-deluxe-3",
    title: ".22 Deluxe Rifle Characteristics & Stripping",
    description: "Specifications, trigger mechanism, safe handling, HAT principle, and cleaning procedures.",
    category: "Weapon Training",
    fileUrl: "/study/NCC_Weapon_Training_22.pdf",
    fileType: "PDF",
    fileSize: 3120000,
  },
  {
    id: "wt-insas-4",
    title: "INSAS 5.56mm Rifle & LMG Tactical Notes",
    description: "Aiming guidelines, stoppage clearing, types of firing positions, and grouping targets.",
    category: "Weapon Training",
    fileUrl: "/study/NCC_INSAS_Training.pdf",
    fileType: "PDF",
    fileSize: 4200000,
  },
  {
    id: "mr-topo-5",
    title: "Map Reading & Topographical Symbols Guide",
    description: "Reading grid references, service protractor usage, bearing calculations, and contour interpretation.",
    category: "Map Reading",
    fileUrl: "/study/NCC_Map_Reading_Basics.pdf",
    fileType: "PDF",
    fileSize: 5120000,
  },
  {
    id: "mr-compass-6",
    title: "Prismatic Compass & Night Navigation",
    description: "Setting magnetic north, night march charts, celestial navigation basics, and dead reckoning.",
    category: "Map Reading",
    fileUrl: "/study/NCC_Compass_Navigation.pdf",
    fileType: "PDF",
    fileSize: 2800000,
  },
  {
    id: "lead-traits-7",
    title: "Leadership Traits & Military Values Handout",
    description: "Core leadership qualities, decision making under stress, discipline, and moral courage.",
    category: "Leadership",
    fileUrl: "/study/NCC_Leadership_Traits.pdf",
    fileType: "PDF",
    fileSize: 1540000,
  },
  {
    id: "cert-b-sample-8",
    title: "Certificate 'B' Examination Model Question Paper",
    description: "Past five years solved question sets covering General and Specialized subjects for Army wing.",
    category: "Certificate B",
    fileUrl: "/study/NCC_Cert_B_Exam_Paper.pdf",
    fileType: "PDF",
    fileSize: 3890000,
  },
  {
    id: "cert-c-guide-9",
    title: "Certificate 'C' Direct SSB Preparation Handbook",
    description: "Advanced syllabus syllabus, viva questions, weapon tests, and SSB screening strategy.",
    category: "Certificate C",
    fileUrl: "/study/NCC_Cert_C_SSB_Guide.pdf",
    fileType: "PDF",
    fileSize: 6200000,
  },
];

export default async function StudyMaterialsPage() {
  let dbMaterials: any[] = [];
  try {
    dbMaterials = await prisma.studyMaterial.findMany({
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("Failed to load study materials from DB:", error);
  }

  // Combine DB materials with default structured materials
  const combined = [...dbMaterials, ...defaultMaterials];

  return <StudyMaterialsClient initialMaterials={combined} />;
}
