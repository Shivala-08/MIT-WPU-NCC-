import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";

export async function GET() {
  await requireAdmin();

  try {
    const cadets = await prisma.user.findMany({
      where: { role: "CADET" },
      include: { cadetProfile: true },
      orderBy: { createdAt: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("NCC_Cadets");

    sheet.columns = [
      { header: "Full Name", key: "fullName", width: 28 },
      { header: "Email", key: "email", width: 30 },
      { header: "Regimental No", key: "regiNumber", width: 18 },
      { header: "Wing", key: "wing", width: 12 },
      { header: "Division", key: "division", width: 12 },
      { header: "Year", key: "year", width: 14 },
      { header: "Branch", key: "branch", width: 30 },
      { header: "PRN", key: "prn", width: 16 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Blood Group", key: "bloodGroup", width: 14 },
      { header: "Gender", key: "gender", width: 10 },
      { header: "Status", key: "status", width: 12 },
      { header: "Parent Contact", key: "parentContact", width: 18 },
    ];

    for (const c of cadets) {
      const p = c.cadetProfile;
      sheet.addRow({
        fullName: p?.fullName || c.name,
        email: c.email,
        regiNumber: p?.regiNumber || "Pending",
        wing: p?.wing || "N/A",
        division: p?.division || "N/A",
        year: p?.year || "N/A",
        branch: p?.branch || "N/A",
        prn: p?.prn || "N/A",
        phone: p?.phone || "N/A",
        bloodGroup: p?.bloodGroup || "N/A",
        gender: p?.gender || "N/A",
        status: p?.status || "PENDING",
        parentContact: p?.parentContact || "N/A",
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="NCC_MITWPU_Cadets_${new Date()
          .toISOString()
          .split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Failed to export cadets:", error);
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 }
    );
  }
}
