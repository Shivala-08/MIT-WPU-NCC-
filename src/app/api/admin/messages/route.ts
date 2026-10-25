import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  await requireAdmin();

  try {
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unread") === "true";

    const where = unreadOnly ? { isRead: false } : {};

    const messages = await prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  await requireAdmin();

  try {
    const body = await req.json();
    const { messageId } = body;

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required" },
        { status: 400 }
      );
    }

    const updated = await prisma.contactMessage.update({
      where: { id: messageId },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true, message: updated });
  } catch (error: unknown) {
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2025") {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }
    console.error("Failed to mark message read:", error);
    return NextResponse.json(
      { error: "Failed to update message" },
      { status: 500 }
    );
  }
}
