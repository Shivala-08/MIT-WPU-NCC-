import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { parseAllowedEmailDomains } from "@/lib/eligibility.mjs";
import {
  parseAndValidateRosterCsv,
} from "@/lib/roster.mjs";
import { importRosterRows, setRosterActive } from "@/lib/roster-service.mjs";

const allowedEmailDomains = parseAllowedEmailDomains(
  process.env.ALLOWED_EMAIL_DOMAIN
);

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const rosterStateSchema = z
  .object({
    rosterId: z.string().trim().min(1),
    active: z.boolean(),
  })
  .strict();

/**
 * Lists the roster with pagination, search and filters.
 */
export async function GET(req: Request) {
  const authz = await authorize(["ADMIN"]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") ?? "").trim();
    const active = searchParams.get("active") ?? "all";
    const match = searchParams.get("match") ?? "all";
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE)
    );

    const where: Prisma.RosterWhereInput = {};

    if (active === "true" || active === "false") {
      where.active = active === "true";
    }

    if (query) {
      where.OR = [
        { fullName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { prn: { contains: query, mode: "insensitive" } },
        { regiNumber: { contains: query, mode: "insensitive" } },
        { wing: { contains: query, mode: "insensitive" } },
        { year: { contains: query, mode: "insensitive" } },
      ];
    }

    if (match === "matched") {
      where.users = { some: {} };
    } else if (match === "unmatched") {
      where.users = { none: {} };
    }

    const [total, rows] = await Promise.all([
      prisma.roster.count({ where }),
      prisma.roster.findMany({
        where,
        orderBy: [{ fullName: "asc" }, { email: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          fullName: true,
          prn: true,
          regiNumber: true,
          wing: true,
          division: true,
          year: true,
          branch: true,
          active: true,
          createdAt: true,
          updatedAt: true,
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              approvalStatus: true,
              role: true,
              cadetProfile: {
                select: {
                  id: true,
                  photoUrl: true,
                  regiNumber: true,
                  wing: true,
                  division: true,
                  year: true,
                  branch: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const roster = rows
      .map((row) => {
        const user = row.users[0] ?? null;

        return {
          id: row.id,
          email: row.email,
          fullName: row.fullName,
          prn: row.prn,
          regiNumber: row.regiNumber,
          wing: row.wing,
          division: row.division,
          year: row.year,
          branch: row.branch,
          active: row.active,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          matched: Boolean(user),
          user: user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                approvalStatus: user.approvalStatus,
                role: user.role,
                hasProfile: Boolean(user.cadetProfile),
                hasPhoto: Boolean(user.cadetProfile?.photoUrl),
              }
            : null,
        };
      });

    return NextResponse.json({
      roster,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("Failed to load roster:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Imports the NCC roster from a CSV file.
 *
 * The email address is the only authoritative field: a row makes an account
 * eligible for automatic approval when the email matches. Every other column
 * is informational and pre-fills the cadet profile.
 *
 * `dryRun: true` validates the file and reports the problems per line without
 * writing anything.
 */
export async function POST(req: Request) {
  const authz = await authorize(["ADMIN"]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = await req.json();
    const csv = typeof body?.csv === "string" ? body.csv : "";
    const dryRun = body?.dryRun === true;

    if (!csv.trim()) {
      return NextResponse.json(
        { error: "A CSV file is required" },
        { status: 400 }
      );
    }

    const { valid, invalid } = parseAndValidateRosterCsv(csv, {
      allowedEmailDomains,
    });

    if (dryRun) {
      const accounts = await prisma.user.findMany({
        where: { email: { in: valid.map((row) => row.email) } },
        select: { email: true, approvalStatus: true, rosterId: true },
      });
      const byEmail = new Map(accounts.map((account) => [account.email, account]));

      return NextResponse.json({
        dryRun: true,
        valid: valid.length,
        invalid,
        matched: valid.filter((row) => byEmail.has(row.email)).length,
        unmatched: valid
          .filter((row) => !byEmail.has(row.email))
          .map((row) => ({
            email: row.email,
            fullName: row.fullName,
            reason:
              "No account uses this email address yet. The cadet is approved automatically at the first sign in.",
          })),
      });
    }

    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: "The roster file contains invalid rows",
          invalid,
        },
        { status: 400 }
      );
    }

    const summary = await importRosterRows(prisma, {
      rows: valid,
      actorId: authz.user.id,
    });

    return NextResponse.json({
      success: true,
      imported: summary.imported,
      created: summary.created,
      updated: summary.updated,
      matched: summary.matched.length,
      unmatched: summary.unmatched,
      attention: summary.attention,
      profiles: summary.matched,
      invalid: [],
    });
  } catch (error) {
    console.error("Roster import failed:", error);
    return NextResponse.json(
      { error: "The roster could not be imported" },
      { status: 500 }
    );
  }
}

/**
 * Activates or deactivates a roster row.
 *
 * Deactivating a row never deletes an account, never changes a role and
 * never changes the approval state of the matched cadet.
 */
export async function PATCH(req: Request) {
  const authz = await authorize(["ADMIN"]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = await req.json();
    const parsed = rosterStateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "A roster id and an active state are required",
        },
        { status: 400 }
      );
    }

    const result = await setRosterActive(prisma, {
      rosterId: parsed.data.rosterId,
      active: parsed.data.active,
      actorId: authz.user.id,
    });

    return NextResponse.json({
      success: true,
      roster: {
        id: result.roster.id,
        email: result.roster.email,
        active: result.roster.active,
      },
    });
  } catch (error) {
    const statusCode =
      typeof (error as { statusCode?: number })?.statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;

    if (statusCode === 500) {
      console.error("Failed to update the roster row:", error);
    }

    return NextResponse.json(
      {
        error:
          statusCode === 404 ? "Roster row not found" : "The roster row could not be updated",
      },
      { status: statusCode }
    );
  }
}
