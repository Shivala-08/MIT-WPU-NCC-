import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { isPhotoPathOwnedBy } from "@/lib/profile-photo.mjs";
import { createProfilePhotoStorage } from "@/lib/profile-storage.mjs";

/**
 * Streams the profile photo of a cadet for an administrator.
 *
 * The route is read only: an administrator never writes a photo onto an
 * account, so a manipulated request cannot move a photo to another cadet.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authz = await authorize(["ADMIN"]);

  if (!authz.ok) {
    return authz.response;
  }

  const { userId } = await params;

  try {
    const { searchParams } = new URL(req.url);
    const variant =
      searchParams.get("variant") === "thumbnail" ? "thumbnail" : "photo";

    const profile = await prisma.cadetProfile.findUnique({
      where: { userId },
      select: { userId: true, photoUrl: true, photoThumbnailUrl: true },
    });

    const path =
      variant === "thumbnail" ? profile?.photoThumbnailUrl : profile?.photoUrl;

    if (!profile || !path || !isPhotoPathOwnedBy(path, profile.userId)) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const created = await createProfilePhotoStorage();

    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: 503 });
    }

    const file = await created.storage.read(path);

    if (!file.ok) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    return new NextResponse(file.bytes, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.bytes.length),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to read the cadet photo:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
