import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import {
  ADMIN_EDITABLE_FIELDS,
  FIELD_LABELS,
  FIELD_OWNERSHIP,
  selectAllowedFields,
} from "@/lib/profile-fields.mjs";
import {
  serializeProfile,
  updateProfileAsAdmin,
} from "@/lib/profile-service.mjs";

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value === "" ? null : value));

const adminProfileUpdateSchema = z
  .object({
    fullName: z
      .union([z.string().trim().min(2).max(120), z.null()])
      .optional()
      .transform((value) => (value === "" ? null : value)),
    prn: optionalText(30),
    regiNumber: optionalText(30),
    wing: optionalText(40),
    division: optionalText(40),
    year: optionalText(40),
    branch: optionalText(80),
    dob: z
      .union([z.string().trim().min(4).max(40), z.null()])
      .optional()
      .transform((value) => (value === "" ? null : value)),
    gender: z
      .union([z.enum(["Male", "Female", "Other"]), z.literal(""), z.null()])
      .optional()
      .transform((value) => (value === "" ? null : value)),
    bloodGroup: optionalText(10),
    phone: optionalText(20),
    address: optionalText(300),
    parentContact: optionalText(40),
    emergencyContact: optionalText(40),
    height: optionalText(20),
    weight: optionalText(20),
  })
  .strict();

/**
 * Reads the full record of one cadet for the administrator.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authz = await authorize(["ADMIN"]);

  if (!authz.ok) {
    return authz.response;
  }

  const { userId } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        approvalStatus: true,
        approvedAt: true,
        rejectionReason: true,
        deactivatedAt: true,
        deactivatedById: true,
        deactivationReason: true,
        rosterId: true,
        createdAt: true,
        roster: {
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
        },
        cadetProfile: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const correctionRequests = await prisma.auditLog.findMany({
      where: {
        userId: user.id,
        action: "PROFILE_CORRECTION_REQUESTED",
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        createdAt: true,
        newData: true,
      },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
        approvedAt: user.approvedAt,
        rejectionReason: user.rejectionReason,
        deactivatedAt: user.deactivatedAt,
        deactivatedById: user.deactivatedById,
        deactivationReason: user.deactivationReason,
        createdAt: user.createdAt,
      },
      roster: user.roster,
      rosterMatched: Boolean(user.roster),
      profile: serializeProfile(user.cadetProfile),
      hasPhoto: Boolean(user.cadetProfile?.photoUrl),
      correctionRequests,
      editableFields: ADMIN_EDITABLE_FIELDS.map((field) => ({
        field,
        label: FIELD_LABELS[field] ?? field,
        owner: FIELD_OWNERSHIP[field],
      })),
    });
  } catch (error) {
    console.error("Failed to load the cadet record:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Corrects the administrator owned fields of a cadet profile.
 *
 * The approval state is not part of the accepted fields: it stays on
 * `PATCH /api/admin/cadets`, the authoritative approval path.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authz = await authorize(["ADMIN"]);

  if (!authz.ok) {
    return authz.response;
  }

  const { userId } = await params;

  try {
    const body = await req.json();
    const allowed = selectAllowedFields(body, ADMIN_EDITABLE_FIELDS);

    if (!allowed.ok) {
      return NextResponse.json(
        {
          error:
            allowed.errors[0]?.message ??
            "The request contains fields that cannot be changed here",
          fields: allowed.errors,
        },
        { status: 400 }
      );
    }

    const parsed = adminProfileUpdateSchema.safeParse(allowed.values);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];

      return NextResponse.json(
        {
          error: issue?.message ?? "The profile could not be saved",
          field:
            typeof issue?.path[0] === "string" ? issue.path[0] : undefined,
        },
        { status: 400 }
      );
    }

    const values = { ...parsed.data };

    if (typeof values.dob === "string" && values.dob.length > 0) {
      const parsedDate = new Date(values.dob);

      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: "The date of birth is not a valid date", field: "dob" },
          { status: 400 }
        );
      }

      values.dob = parsedDate.toISOString();
    }

    const result = await updateProfileAsAdmin(prisma, {
      userId,
      values,
      actorId: authz.user.id,
    });

    return NextResponse.json({
      success: true,
      changed: result.changed,
      profile: serializeProfile(result.profile),
    });
  } catch (error) {
    const statusCode =
      typeof (error as { statusCode?: number })?.statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;

    if (statusCode === 500) {
      console.error("Failed to update the cadet profile:", error);
    }

    return NextResponse.json(
      {
        error:
          statusCode === 404
            ? "Cadet profile not found"
            : "The profile could not be saved",
      },
      { status: statusCode }
    );
  }
}
