import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import prisma from "@/lib/prisma";
import {
  PROFILE_PHOTO_MAX_REQUEST_BYTES,
  isPhotoPathOwnedBy,
} from "@/lib/profile-photo.mjs";
import { createProfilePhotoStorage } from "@/lib/profile-storage.mjs";
import { processProfilePhoto } from "@/lib/profile-photo-image";
import {
  removeProfilePhoto,
  replaceProfilePhoto,
} from "@/lib/profile-photo-service.mjs";
import { readMultipartBody } from "@/lib/http-body.mjs";

const PROFILE_ROLES = ["CADET", "OFFICER", "ADMIN"] as const;

/**
 * Uploads the profile photo of the signed in cadet.
 *
 * The route never accepts a user id, a storage path or a bucket name: the
 * owner is taken from the session and the object names are generated on the
 * server.
 *
 * The body of the request is read with a limit, so an oversized upload is
 * refused while it is read and not after the whole body was buffered.
 *
 * The replacement itself lives in the photo service, so that the recovery
 * after a failure of the storage or of the database can be proved against a
 * real database.
 */
export async function POST(req: Request) {
  const authz = await authorize([...PROFILE_ROLES]);

  if (!authz.ok) {
    return authz.response;
  }

  let form: FormData;

  try {
    form = await readMultipartBody(req, PROFILE_PHOTO_MAX_REQUEST_BYTES);
  } catch (error) {
    const statusCode =
      typeof (error as { statusCode?: number })?.statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 400;

    if (statusCode >= 500) {
      console.error("Failed to read the photo upload:", error);
    }

    return NextResponse.json(
      {
        error:
          statusCode === 413
            ? "The photo is too large"
            : "The photo could not be read",
      },
      { status: statusCode }
    );
  }

  const entry = form.get("photo");

  if (!entry || typeof entry === "string") {
    return NextResponse.json(
      { error: "A photo file is required" },
      { status: 400 }
    );
  }

  const file = entry as File;
  const created = await createProfilePhotoStorage();

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 503 });
  }

  const result = await replaceProfilePhoto({
    db: prisma,
    storage: created.storage,
    processor: processProfilePhoto,
    userId: authz.user.id,
    bytes: new Uint8Array(await file.arrayBuffer()),
    declaredType: file.type,
    size: file.size,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.statusCode }
    );
  }

  return NextResponse.json({
    success: true,
    hasPhoto: true,
    width: result.width,
    height: result.height,
  });
}

/**
 * Removes the profile photo of the signed in cadet.
 *
 * The pointer of the profile and the audit event are changed in one
 * transaction. The objects of the storage are removed after the transaction,
 * so a failure of the removal never leaves the profile pointing at an object
 * that is gone.
 */
export async function DELETE() {
  const authz = await authorize([...PROFILE_ROLES]);

  if (!authz.ok) {
    return authz.response;
  }

  const created = await createProfilePhotoStorage();

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 503 });
  }

  const result = await removeProfilePhoto({
    db: prisma,
    storage: created.storage,
    userId: authz.user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.statusCode }
    );
  }

  return NextResponse.json({ success: true, hasPhoto: false });
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

    const profile = await prisma.cadetProfile.findUnique({
      where: { userId: authz.user.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

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
