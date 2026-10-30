import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import {
  buildPhotoObjectNames,
  isPhotoPathOwnedBy,
  PROFILE_PHOTO_MAX_BYTES,
  validateProfilePhoto,
} from "@/lib/profile-photo.mjs";
import { createProfilePhotoStorage } from "@/lib/profile-storage.mjs";
import { processProfilePhoto } from "@/lib/profile-photo-image";

const PROFILE_ROLES = ["CADET", "OFFICER", "ADMIN"] as const;

type PhotoStorage = {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<boolean>;
  remove(path: string): Promise<boolean>;
  read(
    path: string
  ): Promise<
    | { ok: true; bytes: Uint8Array; contentType: string }
    | { ok: false }
  >;
};

async function loadOwnProfile(userId: string) {
  return prisma.cadetProfile.findUnique({
    where: { userId },
    select: { id: true, photoUrl: true, photoThumbnailUrl: true },
  });
}

/**
 * Uploads the profile photo of the signed in cadet.
 *
 * The route never accepts a user id, a storage path or a bucket name: the
 * owner is taken from the session and the object names are generated on the
 * server.
 */
export async function POST(req: Request) {
  const authz = await authorize([...PROFILE_ROLES]);

  if (!authz.ok) {
    return authz.response;
  }

  let uploadedPhotoPath: string | null = null;
  let uploadedThumbnailPath: string | null = null;
  let storage: PhotoStorage | null = null;

  try {
    const form = await req.formData();
    const entry = form.get("photo");

    if (!entry || typeof entry === "string") {
      return NextResponse.json(
        { error: "A photo file is required" },
        { status: 400 }
      );
    }

    const file = entry as File;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const validation = validateProfilePhoto({
      bytes,
      declaredType: file.type,
      size: file.size ?? bytes.length,
      maxBytes: PROFILE_PHOTO_MAX_BYTES,
    });

    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, code: validation.code },
        { status: 400 }
      );
    }

    const created = await createProfilePhotoStorage();

    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: 503 });
    }

    const photoStorage: PhotoStorage = created.storage;
    storage = photoStorage;

    let processed;

    try {
      processed = await processProfilePhoto(bytes);
    } catch (error) {
      console.error("Failed to process the profile photo:", error);
      return NextResponse.json(
        { error: "The photo could not be processed" },
        { status: 400 }
      );
    }

    const { photoPath, thumbnailPath } = buildPhotoObjectNames(authz.user.id);

    await photoStorage.put(photoPath, processed.photo, "image/webp");
    uploadedPhotoPath = photoPath;

    await photoStorage.put(thumbnailPath, processed.thumbnail, "image/webp");
    uploadedThumbnailPath = thumbnailPath;

    const profile = await loadOwnProfile(authz.user.id);

    if (!profile) {
      throw new Error("Cadet profile not found");
    }

    await prisma.cadetProfile.update({
      where: { userId: authz.user.id },
      data: { photoUrl: photoPath, photoThumbnailUrl: thumbnailPath },
    });

    const previousPhoto = profile.photoUrl;
    const previousThumbnail = profile.photoThumbnailUrl;

    if (
      previousPhoto &&
      isPhotoPathOwnedBy(previousPhoto, authz.user.id) &&
      previousPhoto !== photoPath
    ) {
      await photoStorage.remove(previousPhoto).catch((error: unknown) => {
        console.error("Failed to remove the previous profile photo:", error);
      });
    }

    if (
      previousThumbnail &&
      isPhotoPathOwnedBy(previousThumbnail, authz.user.id) &&
      previousThumbnail !== thumbnailPath
    ) {
      await photoStorage.remove(previousThumbnail).catch((error: unknown) => {
        console.error("Failed to remove the previous thumbnail:", error);
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: authz.user.id,
        action: "PROFILE_PHOTO_UPDATED",
        entity: "CadetProfile",
        entityId: profile.id,
        oldData: { photoUrl: previousPhoto ?? null },
        newData: { photoUrl: photoPath },
      },
    });

    return NextResponse.json({
      success: true,
      hasPhoto: true,
      width: processed.width,
      height: processed.height,
    });
  } catch (error) {
    console.error("Failed to store the profile photo:", error);

    if (storage) {
      if (uploadedPhotoPath) {
        await storage.remove(uploadedPhotoPath).catch(() => undefined);
      }
      if (uploadedThumbnailPath) {
        await storage.remove(uploadedThumbnailPath).catch(() => undefined);
      }
    }

    return NextResponse.json(
      { error: "The photo could not be stored" },
      { status: 500 }
    );
  }
}

/**
 * Removes the profile photo of the signed in cadet.
 */
export async function DELETE() {
  const authz = await authorize([...PROFILE_ROLES]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const profile = await loadOwnProfile(authz.user.id);

    if (!profile) {
      return NextResponse.json(
        { error: "Cadet profile not found" },
        { status: 404 }
      );
    }

    const created = await createProfilePhotoStorage();

    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: 503 });
    }

    await prisma.cadetProfile.update({
      where: { userId: authz.user.id },
      data: { photoUrl: null, photoThumbnailUrl: null },
    });

    for (const path of [profile.photoUrl, profile.photoThumbnailUrl]) {
      if (path && isPhotoPathOwnedBy(path, authz.user.id)) {
        await created.storage.remove(path).catch((error: unknown) => {
          console.error("Failed to remove the profile photo:", error);
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: authz.user.id,
        action: "PROFILE_PHOTO_REMOVED",
        entity: "CadetProfile",
        entityId: profile.id,
        oldData: { photoUrl: profile.photoUrl ?? null },
        newData: { photoUrl: null },
      },
    });

    return NextResponse.json({ success: true, hasPhoto: false });
  } catch (error) {
    console.error("Failed to remove the profile photo:", error);
    return NextResponse.json(
      { error: "The photo could not be removed" },
      { status: 500 }
    );
  }
}

/**
 * Streams the profile photo of the signed in cadet.
 *
 * The photo is never served from a public bucket: the bytes only leave the
 * server after the database backed authorisation check.
 */
export async function GET(req: Request) {
  const authz = await authorize([...PROFILE_ROLES]);

  if (!authz.ok) {
    return authz.response;
  }

  try {
    const { searchParams } = new URL(req.url);
    const variant = searchParams.get("variant") === "thumbnail" ? "thumbnail" : "photo";

    const profile = await loadOwnProfile(authz.user.id);
    const path = variant === "thumbnail" ? profile?.photoThumbnailUrl : profile?.photoUrl;

    if (!profile || !path || !isPhotoPathOwnedBy(path, authz.user.id)) {
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
    console.error("Failed to read the profile photo:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
