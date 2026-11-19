import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { canManageSessions } from "@/lib/attendance-permissions.mjs";
import { eligibleCadetWhere } from "@/lib/attendance-eligibility.mjs";
import { queryString, serviceErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  const authz = await authorize(["ADMIN", "OFFICER"]);

  if (!authz.ok) {
    return authz.response;
  }

  if (!canManageSessions(authz.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const search = queryString(req, "search");
  const wing = queryString(req, "wing");

  try {
    // The roll of a session only holds the cadets of the current unit: an
    // approved account, no deactivation and an active roster row.
    const where: Record<string, unknown> = eligibleCadetWhere();

    const profileFilter: Record<string, unknown> = {};

    if (wing) {
      profileFilter.wing = wing;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        {
          cadetProfile: {
            is: {
              OR: [
                { fullName: { contains: search, mode: "insensitive" } },
                { prn: { contains: search, mode: "insensitive" } },
                { regiNumber: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    if (Object.keys(profileFilter).length > 0) {
      where.cadetProfile = { is: profileFilter };
    }

    const cadets = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        cadetProfile: {
          select: {
            fullName: true,
            prn: true,
            regiNumber: true,
            wing: true,
            division: true,
            year: true,
            branch: true,
          },
        },
      },
      orderBy: { name: "asc" },
      take: 500,
    });

    return NextResponse.json({
      cadets: cadets.map((cadet) => ({
        id: cadet.id,
        name: cadet.name,
        email: cadet.email,
        fullName: cadet.cadetProfile?.fullName ?? cadet.name,
        prn: cadet.cadetProfile?.prn ?? null,
        regiNumber: cadet.cadetProfile?.regiNumber ?? null,
        wing: cadet.cadetProfile?.wing ?? null,
        division: cadet.cadetProfile?.division ?? null,
        year: cadet.cadetProfile?.year ?? null,
        branch: cadet.cadetProfile?.branch ?? null,
      })),
    });
  } catch (error) {
    return serviceErrorResponse(error, "The cadet roll could not be loaded");
  }
}
