import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { resolveStudyMaterialUrl } from "@/lib/study-materials";

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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorize(["ADMIN", "OFFICER", "CADET"]);
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const { id } = await params;

    const material = await prisma.studyMaterial.findUnique({
      where: { id },
    });

    const fileUrl = material
      ? material.fileUrl
      : defaultMaterials[id]?.fileUrl;

    if (!fileUrl) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    const resolved = resolveStudyMaterialUrl(fileUrl, req.url);

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    return NextResponse.redirect(resolved.url);
  } catch (error) {
    console.error("Study material download error:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
