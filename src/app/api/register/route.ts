import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const cadetRegistrationSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
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
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = cadetRegistrationSchema.parse(body);

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        name: data.fullName,
        email: data.email.toLowerCase(),
        password: hashedPassword,
        role: "CADET",
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
            status: "PENDING",
          },
        },
      },
      include: {
        cadetProfile: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Registration submitted successfully. Pending administrative verification.",
        userId: user.id,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Validation failed" },
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
