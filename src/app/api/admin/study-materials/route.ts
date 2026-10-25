import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const studyMaterialSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  category: z.string().min(1, "Category is required").max(100),
  fileUrl: z.string().url("File URL must be a valid URL"),
  fileType: z.enum(["PDF", "DOCX", "PPT", "IMAGE", "VIDEO"]).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const validatedData = studyMaterialSchema.parse(body);

    const material = await prisma.studyMaterial.create({
      data: {
        title: validatedData.title,
        description: validatedData.description || null,
        category: validatedData.category,
        fileUrl: validatedData.fileUrl,
        fileType: validatedData.fileType || "PDF",
      },
    });

    return NextResponse.json({ success: true, material }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const issues = (error as { issues?: z.ZodIssue[]; errors?: z.ZodIssue[] }).issues || (error as { issues?: z.ZodIssue[]; errors?: z.ZodIssue[] }).errors;
      return NextResponse.json(
        { error: issues?.[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }
    console.error("Study material creation error:", error);
    return NextResponse.json({ error: "Creation failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing material id" }, { status: 400 });
    }

    await prisma.studyMaterial.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Study material delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
