import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import {
  CADET_EDITABLE_FIELDS,
  FIELD_LABELS,
  FIELD_OWNERSHIP,
  selectAllowedFields,
} from "@/lib/profile-fields.mjs";
import {
  ensureProfileForUser,
  readProfile,
  serializeProfile,
  updateOwnProfile,
} from "@/lib/profile-service.mjs";

const PROFILE_ROLES = ["CADET", "OFFICER", "ADMIN"] as const;

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value === "" ? null : value));

const cadetProfileUpdateSchema = z
  .object({
    phone: optionalText(20),
    address: optionalText(300),
    parentContact: optionalText(40),
    emergencyContact: optionalText(40),
    bloodGroup: optionalText(10),
    gender: z
      .union([z.enum(["Male", "Female", "Other"]), z.literal(""), z.null()])
      .optional()
      .transform((value) => (value === "" ? null : value)),
    height: optionalText(20),
    weight: optionalText(20),
  })
  .strict();

/**
 * The ownership map is returned with the profile so that the interface can
 * show which fields are locked without hard coding the rules in the browser.
 */
function ownershipForClient() {
  return CADET_EDITABLE_FIELDS.map((field) => ({
    field,
    label: FIELD_LABELS[field] ?? field,
    owner: FIELD_OWNERSHIP[field],
  }));
}

/**
 * Reads the profile of the signed in cadet.
 *
 * The profile is always looked up by the user id of the authenticated
 * session: a client supplied id is never used to find a profile.
 */
export async function GET() {
  const authz = await authorize([...PROFILE_ROLES]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: authz.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        approvalStatus: true,
        rosterId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const roster = await prisma.roster.findFirst({
      where: { users: { some: { id: user.id } } },
      select: {
        fullName: true,
        prn: true,
        regiNumber: true,
        wing: true,
        division: true,
        year: true,
        branch: true,
      },
    });

    const profile = await ensureProfileForUser(prisma, {
      user,
      rosterRow: roster,
    });

    return NextResponse.json({
      profile: serializeProfile(profile),
      editableFields: ownershipForClient(),
    });
  } catch (error) {
    console.error("Failed to load the cadet profile:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Updates the personal fields of the signed in cadet.
 *
 * Only the cadet owned fields are accepted. A request that contains a roster
 * controlled field, an administrator controlled field, a role, an approval
 * state, a user id or an unknown field is rejected with a per field message.
 */
export async function PATCH(req: Request) {
  const authz = await authorize([...PROFILE_ROLES]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = await req.json();
    const allowed = selectAllowedFields(body, CADET_EDITABLE_FIELDS);

    if (!allowed.ok) {
      return NextResponse.json(
        {
          error: allowed.errors[0]?.message ?? "The request contains fields that cannot be changed",
          fields: allowed.errors,
        },
        { status: 400 }
      );
    }

    const parsed = cadetProfileUpdateSchema.safeParse(allowed.values);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0];

      return NextResponse.json(
        {
          error: issue?.message ?? "The profile could not be saved",
          field: typeof field === "string" ? field : undefined,
        },
        { status: 400 }
      );
    }

    const result = await updateOwnProfile(prisma, {
      userId: authz.user.id,
      values: parsed.data,
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

/**
 * Reports that a cadet needs a correction on a locked field.
 *
 * The request is stored as an audit entry so an administrator can act on it.
 * It never changes a locked field by itself.
 */
export async function PUT(req: Request) {
  const authz = await authorize([...PROFILE_ROLES]);

  if (!authz.ok) {
    return authz.response;
  }

  const correctionSchema = z
    .object({
      field: z.string().trim().min(1).max(40),
      value: z.string().trim().max(300),
      reason: z.string().trim().min(3).max(500),
    })
    .strict();

  try {
    const body = await req.json();
    const parsed = correctionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const field = parsed.data.field;

    if (!Object.prototype.hasOwnProperty.call(FIELD_OWNERSHIP, field)) {
      return NextResponse.json(
        { error: "That field is not part of the cadet profile" },
        { status: 400 }
      );
    }

    const profile = await readProfile(prisma, authz.user.id);
    const currentValue = profile
      ? ((profile as unknown as Record<string, unknown>)[field] ?? null)
      : null;

    await prisma.auditLog.create({
      data: {
        userId: authz.user.id,
        action: "PROFILE_CORRECTION_REQUESTED",
        entity: "CadetProfile",
        entityId: profile?.id ?? null,
        oldData: { field, value: currentValue },
        newData: { field, value: parsed.data.value, reason: parsed.data.reason },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to store the correction request:", error);
    return NextResponse.json(
      { error: "The correction request could not be sent" },
      { status: 500 }
    );
  }
}
