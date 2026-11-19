import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  parseAllowedEmailDomains,
  isAllowedCollegeEmail,
  normalizeEmail,
} from "@/lib/eligibility.mjs";
import {
  buildNewProfileData,
  CADET_EDITABLE_FIELDS,
  FIELD_OWNERSHIP,
} from "@/lib/profile-fields.mjs";
import { writeAuditEvent } from "@/lib/audit-writer.mjs";

const allowedEmailDomains = parseAllowedEmailDomains(
  process.env.ALLOWED_EMAIL_DOMAIN
);

/**
 * The fields of an application that the applicant owns.
 *
 * The name of the applicant names the account, exactly like the name of the
 * Google profile does during a sign in. It is never written into the roster
 * controlled fields of the profile.
 */
const APPLICATION_OWNED_FIELDS = new Set([
  "fullName",
  "email",
  ...CADET_EDITABLE_FIELDS,
]);

/**
 * A date of the application has to be a real calendar date.
 *
 * A value like `2006-02-31` or `not-a-date` is refused with a clear message
 * instead of reaching the database and failing there.
 */
const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "The date is not a real calendar date");

/**
 * The shape of an application.
 *
 * The schema is not strict here. The fields that somebody else owns are
 * removed by the ownership check below, and every one of them is reported
 * with the name of its owner instead of a generic message.
 */
const applicationShapeSchema = z
  .object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    regiNumber: z.string().optional(),
    wing: z.enum(["Army", "Navy", "Air"]).optional(),
    division: z.string().optional(),
    year: z.string().optional(),
    branch: z.string().optional(),
    prn: z.string().optional(),
    dob: dateOnly.optional(),
    bloodGroup: z.string().min(1, "Blood group is required"),
    gender: z.enum(["Male", "Female", "Other"]),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    address: z.string().optional(),
    parentContact: z.string().optional(),
    height: z.string().optional(),
    weight: z.string().optional(),
    emergencyContact: z.string().optional(),
  })
  .passthrough();

/**
 * The fields of the application that the server refuses to take.
 *
 * The roster of the unit is the administrative source of the academic fields
 * and the date of birth is verified by an administrator. A request that
 * carries one of them is refused instead of being silently dropped, so the
 * applicant is never told that a value was stored when it was not.
 *
 * @param {Record<string, unknown>} payload
 * @returns {{ field: string, message: string }[]}
 */
function refusedFields(payload: Record<string, unknown>) {
  const errors: { field: string; message: string }[] = [];

  for (const field of Object.keys(payload ?? {})) {
    if (APPLICATION_OWNED_FIELDS.has(field)) {
      continue;
    }

    const owner = FIELD_OWNERSHIP[field];

    errors.push({
      field,
      message: owner
        ? `The field "${field}" is maintained by the ${owner.toLowerCase()} of the unit and is not accepted in an application`
        : `The field "${field}" is not part of the cadet application`,
    });
  }

  return errors;
}

/**
 * Optional pre-registration of a cadet application.
 *
 * The endpoint never creates a usable account: the role is always CADET, the
 * approval state is always PENDING and the applicant only reaches the portal
 * after an administrator approves the account. A client supplied user id,
 * role or approval state is rejected by the strict schema.
 *
 * The endpoint also never writes a field that somebody else owns. The roster
 * controlled fields of the profile and the date of birth are refused, the
 * roster import and an administrator own them.
 *
 * The account, its profile and its audit event are written in one
 * transaction. An application that is not in the trail never existed.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = applicationShapeSchema.parse(body);

    const refused = refusedFields(body);

    if (refused.length > 0) {
      return NextResponse.json(
        {
          error: refused[0].message,
          fields: refused,
        },
        { status: 400 }
      );
    }

    const email = normalizeEmail(data.email);

    if (!isAllowedCollegeEmail(email, allowedEmailDomains)) {
      return NextResponse.json(
        {
          error: `Only ${allowedEmailDomains
            .map((domain) => `@${domain}`)
            .join(", ")} college email addresses can be registered`,
        },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 400 }
      );
    }

    // The roster row of the applicant is the administrative source of the
    // name and of the academic fields. It is never written from the request.
    const rosterRow = await prisma.roster.findUnique({
      where: { email },
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
      },
    });

    const accountName =
      String(data.fullName ?? "").trim() || rosterRow?.fullName || "Cadet";

    // The profile only receives the fields that the applicant owns. Every
    // other field comes from the roster or from an administrator.
    const profileData = {
      ...buildNewProfileData({ name: accountName }, rosterRow),
      gender: data.gender,
      bloodGroup: data.bloodGroup,
      phone: data.phone,
      address: data.address || null,
      parentContact: data.parentContact || null,
      height: data.height || null,
      weight: data.weight || null,
      emergencyContact: data.emergencyContact || null,
    };

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: accountName,
          email,
          password: null,
          role: "CADET",
          approvalStatus: "PENDING",
          emailVerifiedAt: null,
          rosterId: rosterRow?.id ?? null,
          cadetProfile: {
            create: profileData,
          },
        },
        select: { id: true, name: true, email: true, approvalStatus: true },
      });

      await writeAuditEvent(tx, {
        actorId: null,
        action: "REGISTRATION_SUBMITTED",
        entity: "User",
        entityId: user.id,
        oldData: null,
        newData: {
          email: user.email,
          approvalStatus: user.approvalStatus,
          role: "CADET",
          source: "APPLICATION",
        },
      });

      return user;
    });

    return NextResponse.json(
      {
        success: true,
        id: created.id,
        message:
          "Registration submitted successfully. Pending administrative verification.",
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const issues = (error as { issues?: z.ZodIssue[]; errors?: z.ZodIssue[] })
        .issues;
      return NextResponse.json(
        { error: issues?.[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }
    console.error("Cadet registration error:", error);
    return NextResponse.json(
      { error: "Failed to process enrollment. Please try again." },
      { status: 500 }
    );
  }
}
