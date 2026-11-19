import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { isApprovalStatus } from "@/lib/approval";
import { computeProfileCompletion } from "@/lib/profile-fields.mjs";
import { USER_OMIT, stripPasswordFromRecords } from "@/lib/user-fields.mjs";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * The cadet directory.
 *
 * It is a read only view over the same records as `/api/admin/cadets`: the
 * approval state comes from `User.approvalStatus` and the roster match from
 * `User.rosterId`, so there is only one source of truth.
 */
export async function GET(req: Request) {
  const authz = await authorize(["ADMIN"]);

  if (!authz.ok) {
    return authz.response;
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const wing = searchParams.get("wing");
  const query = searchParams.get("q");
  const roster = searchParams.get("roster");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE)
  );

  try {
    const cadetProfile: Prisma.CadetProfileWhereInput = {};
    const where: Prisma.UserWhereInput = { role: "CADET" };

    if (status && status !== "ALL") {
      if (isApprovalStatus(status)) {
        where.approvalStatus = status;
      } else {
        cadetProfile.status = status;
      }
    }

    if (wing && wing !== "ALL") {
      cadetProfile.wing = wing;
    }

    if (roster === "matched") {
      where.rosterId = { not: null };
    } else if (roster === "unmatched") {
      where.rosterId = null;
    }

    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { cadetProfile: { regiNumber: { contains: query, mode: "insensitive" } } },
        { cadetProfile: { prn: { contains: query, mode: "insensitive" } } },
      ];
    }

    if (Object.keys(cadetProfile).length > 0) {
      where.cadetProfile = cadetProfile;
    }

    const [total, cadets] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        omit: USER_OMIT,
        include: {
          cadetProfile: true,
          roster: { select: { id: true, email: true, active: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const sanitized = stripPasswordFromRecords(cadets) as Array<{
      roster?: { id: string; email: string; active: boolean } | null;
      cadetProfile: object | null;
      [key: string]: unknown;
    }>;

    return NextResponse.json({
      cadets: sanitized.map((cadet) => ({
        ...cadet,
        rosterMatched: Boolean(cadet.roster),
        rosterActive: cadet.roster?.active ?? null,
        completion: computeProfileCompletion(cadet.cadetProfile),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("Failed to fetch the cadet directory:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
