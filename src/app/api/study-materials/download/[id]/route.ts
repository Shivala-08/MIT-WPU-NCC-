import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // First check database materials
    const material = await prisma.studyMaterial.findUnique({
      where: { id },
    });

    if (material) {
      // For database materials, redirect to file URL
      return NextResponse.redirect(material.fileUrl);
    }

    // Check default materials (static files in /public/study/)
    const defaultMaterials: Record<string, { fileUrl: string; fileType: string }> = {
      "drill-manual-1": { fileUrl: "/study/NCC_Drill_Manual.pdf", fileType: "PDF" },
      "drill-arms-2": { fileUrl: "/study/NCC_Arms_Drill.pdf", fileType: "PDF" },
      "wt-deluxe-3": { fileUrl: "/study/NCC_Weapon_Training_22.pdf", fileType: "PDF" },
      "wt-insas-4": { fileUrl: "/study/NCC_INSAS_Training.pdf", fileType: "PDF" },
      "mr-topo-5": { fileUrl: "/study/NCC_Map_Reading_Basics.pdf", fileType: "PDF" },
      "mr-compass-6": { fileUrl: "/study/NCC_Compass_Navigation.pdf", fileType: "PDF" },
      "lead-traits-7": { fileUrl: "/study/NCC_Leadership_Traits.pdf", fileType: "PDF" },
      "cert-b-sample-8": { fileUrl: "/study/NCC_Cert_B_Exam_Paper.pdf", fileType: "PDF" },
      "cert-c-guide-9": { fileUrl: "/study/NCC_Cert_C_SSB_Guide.pdf", fileType: "PDF" },
    };

    const defaultMaterial = defaultMaterials[id];
    if (defaultMaterial) {
      return NextResponse.redirect(defaultMaterial.fileUrl);
    }

    return NextResponse.json({ error: "Material not found" }, { status: 404 });
  } catch (error) {
    console.error("Study material download error:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}