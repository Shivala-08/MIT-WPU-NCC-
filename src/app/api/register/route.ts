import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { parseAllowedEmailDomains, isAllowedCollegeEmail } from "@/lib/eligibility.mjs";

const allowedEmailDomains = parseAllowedEmailDomains(
  process.env.ALLOWED_EMAIL_DOMAIN
);

const cadetRegistrationSchema = z
  .object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    regiNumber: z.string().optional(),
    wing: z.enum(["Army", "Navy", "Air"]),
    division: z.string().optional().default("SD/SW"),
    year: z.string().min(1, "Year of study is required"),
    branch: z.string().min(2, "Branch/Department is required"),
    prn: z.string().optional(),
    dob: z.string().min(1, "Date of birth is required"),
    bloodGroup: z.string().min(1, "Blood group is required"),
    gender: z.enum(["Male", "Female", "Other"]),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    address: z.string().optional(),
    parentContact: z.string().optional(),
    height: z.string().optional(),
    weight: z.string().optional(),
    emergencyContact: z.string().optional(),
  })
  .strict();

/**
 * Optional pre-registration of a cadet application.
 *
 * The endpoint never creates a usable account: the role is always CADET, the
 * approval state is always PENDING and the applicant only reaches the portal
 * after an administrator approves the account. A client supplied user id,
 * role or approval state is rejected by the strict schema.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = cadetRegistrationSchema.parse(body);

    const email = data.email.trim().toLowerCase();

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

    await prisma.user.create({
      data: {
        name: data.fullName,
        email,
        password: null,
        role: "CADET",
        approvalStatus: "PENDING",
        emailVerifiedAt: null,
        cadetProfile: {
          create: {
            fullName: data.fullName,
            regiNumber: data.regiNumber || null,
            wing: data.wing,
            division: data.division || "SD/SW",
            year: data.year,
            branch: data.branch,
            prn: data.prn || null,
            dob: new Date(data.dob),
            bloodGroup: data.bloodGroup,
            gender: data.gender,
            phone: data.phone,
            address: data.address || null,
            parentContact: data.parentContact || null,
            height: data.height || null,
            weight: data.weight || null,
            emergencyContact: data.emergencyContact || null,
          },
        },
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: null,
        action: "REGISTRATION_SUBMITTED",
        entity: "User",
        entityId: null,
        newData: { email },
      },
    });

    return NextResponse.json(
      {
        success: true,
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
