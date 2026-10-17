import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { title, description, category, fileUrl, fileType } = body;

    if (!title || !category || !fileUrl) {
      return NextResponse.json(
        { error: "Title, category and file URL are required" },
        { status: 400 }
      );
    }

    const material = await prisma.studyMaterial.create({
      data: {
        title,
        description: description || null,
        category,
        fileUrl,
        fileType: fileType || "PDF",
      },
    });

    return NextResponse.json({ success: true, material }, { status: 201 });
  } catch (error) {
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
