import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { parseAllowedEmailDomains } from "@/lib/eligibility.mjs";
import {
  ROSTER_MAX_ROWS,
  parseAndValidateRosterCsv,
} from "@/lib/roster.mjs";

const allowedEmailDomains = parseAllowedEmailDomains(
  process.env.ALLOWED_EMAIL_DOMAIN
);

export async function GET() {
  const authz = await authorize(["ADMIN"]);
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const roster = await prisma.roster.findMany({
      orderBy: { createdAt: "desc" },
      take: ROSTER_MAX_ROWS,
    });

    return NextResponse.json({ roster });
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
 * is informational and only pre-fills the cadet profile.
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
      return NextResponse.json({
        dryRun: true,
        valid: valid.length,
        invalid,
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

    let imported = 0;

    for (const row of valid) {
      await prisma.roster.upsert({
        where: { email: row.email },
        update: {
          fullName: row.fullName,
          prn: row.prn,
          regiNumber: row.regiNumber,
          wing: row.wing,
          division: row.division,
          year: row.year,
          branch: row.branch,
          active: true,
        },
        create: {
          email: row.email,
          fullName: row.fullName,
          prn: row.prn,
          regiNumber: row.regiNumber,
          wing: row.wing,
          division: row.division,
          year: row.year,
          branch: row.branch,
          active: true,
        },
      });
      imported += 1;
    }

    await prisma.auditLog.create({
      data: {
        userId: authz.user.id,
        action: "ROSTER_IMPORTED",
        entity: "Roster",
        entityId: null,
        newData: { imported },
      },
    });

    return NextResponse.json({ success: true, imported, invalid: [] });
  } catch (error) {
    console.error("Roster import failed:", error);
    return NextResponse.json(
      { error: "The roster could not be imported" },
      { status: 500 }
    );
  }
}
