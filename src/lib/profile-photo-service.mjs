/**
 * The photo operations of a cadet profile.
 *
 * The route of the application is thin: it reads the body with a limit, it
 * validates the file and it calls the functions of this module. The logic of
 * the replacement and of the removal lives here, so that the failure of the
 * storage and the failure of the database can be injected and the recovery
 * can be proved against a real database.
 *
 * The order of the replacement is the important part:
 *
 *   1. the new objects are written to the storage;
 *   2. the pointer of the profile and the audit event are written in one
 *      transaction;
 *   3. only then are the old objects removed.
 *
 * A failure before the transaction leaves the old photo in place and removes
 * the new objects. A failure of the transaction rolls the pointer back and
 * removes the new objects. A failure of the removal of the old objects leaves
 * a harmless object behind, because the database no longer points at it.
 * The photo of a cadet is never lost.
 */

import {
  buildPhotoObjectNames,
  isPhotoPathOwnedBy,
  PROFILE_PHOTO_MAX_BYTES,
  validateProfilePhoto,
} from "./profile-photo.mjs";
import { writeAuditEvent } from "./audit-writer.mjs";
import { runInTransaction } from "./db-transaction.mjs";

/**
 * @typedef {{
 *   put(path: string, bytes: Uint8Array, contentType: string): Promise<boolean>,
 *   remove(path: string): Promise<boolean>,
 * }} PhotoStorage
 */

/**
 * The image pipeline of a photo.
 *
 * The pipeline is injected, so the service does not depend on the image
 * library. The route of the application passes the pipeline of the
 * application, the tests pass their own.
 *
 * @typedef {(bytes: Uint8Array) => Promise<{
 *   photo: Uint8Array,
 *   thumbnail: Uint8Array,
 *   width: number,
 *   height: number,
 * }>} PhotoProcessor
 */

/**
 * Removes an object of the storage and reports a failure.
 *
 * A failure of the removal is never fatal. The object is private and it is
 * not reachable without the path of the database, so an object that stays
 * behind is harmless.
 *
 * @param {PhotoStorage} storage
 * @param {string | null | undefined} path
 * @param {string} label
 * @returns {Promise<void>}
 */
async function removeQuietly(storage, path, label) {
  if (!path) {
    return;
  }

  try {
    await storage.remove(path);
  } catch (error) {
    console.error(`Failed to remove ${label}:`, error);
  }
}

/**
 * @param {any} db
 * @param {string} userId
 * @returns {Promise<any | null>}
 */
async function loadProfile(db, userId) {
  return db.cadetProfile.findUnique({
    where: { userId },
    select: { id: true, photoUrl: true, photoThumbnailUrl: true },
  });
}

/**
 * @typedef {{
 *   ok: true,
 *   width: number,
 *   height: number,
 * } | {
 *   ok: false,
 *   statusCode: number,
 *   error: string,
 *   code?: string,
 * }} PhotoResult
 */

/**
 * Replaces the photo of a cadet.
 *
 * @param {{
 *   db: any,
 *   storage: PhotoStorage,
 *   processor: PhotoProcessor,
 *   userId: string,
 *   bytes: Uint8Array,
 *   declaredType?: unknown,
 *   size?: number,
 *   maxBytes?: number,
 * }} input
 * @returns {Promise<PhotoResult>}
 */
export async function replaceProfilePhoto({
  db,
  storage,
  processor,
  userId,
  bytes,
  declaredType,
  size,
  maxBytes = PROFILE_PHOTO_MAX_BYTES,
}) {
  const validation = validateProfilePhoto({
    bytes,
    declaredType,
    size,
    maxBytes,
  });

  if (!validation.ok) {
    // A file that is too large is a request that is too large.
    const statusCode = validation.code === "TOO_LARGE" ? 413 : 400;

    return {
      ok: false,
      statusCode,
      error: validation.error,
      code: validation.code,
    };
  }

  let uploadedPhotoPath = null;
  let uploadedThumbnailPath = null;
  let committed = false;

  try {
    let processed;

    try {
      if (typeof processor !== "function") {
        throw new Error("The image pipeline of the photo is not available");
      }

      processed = await processor(bytes);
    } catch (error) {
      console.error("Failed to process the profile photo:", error);

      return {
        ok: false,
        statusCode: 400,
        error: "The photo could not be processed",
        code: "PROCESSING_FAILED",
      };
    }

    const { photoPath, thumbnailPath } = buildPhotoObjectNames(userId);

    await storage.put(photoPath, processed.photo, "image/webp");
    uploadedPhotoPath = photoPath;

    await storage.put(thumbnailPath, processed.thumbnail, "image/webp");
    uploadedThumbnailPath = thumbnailPath;

    const profile = await loadProfile(db, userId);

    if (!profile) {
      throw new Error("Cadet profile not found");
    }

    const previousPhoto = profile.photoUrl;
    const previousThumbnail = profile.photoThumbnailUrl;

    // The pointer of the profile and the audit event are changed in one
    // transaction. The photo of the cadet is never changed without its audit
    // event and the audit event never claims a change that did not happen.
    await runInTransaction(db, async (tx) => {
      await tx.cadetProfile.update({
        where: { userId },
        data: { photoUrl: photoPath, photoThumbnailUrl: thumbnailPath },
      });

      await writeAuditEvent(tx, {
        actorId: userId,
        action: "PROFILE_PHOTO_UPDATED",
        entity: "CadetProfile",
        entityId: profile.id,
        oldData: { changedFields: ["photoUrl", "photoThumbnailUrl"] },
        newData: { changedFields: ["photoUrl", "photoThumbnailUrl"] },
      });
    });

    committed = true;

    // The old objects are only removed after the database points at the new
    // ones.
    if (
      previousPhoto &&
      isPhotoPathOwnedBy(previousPhoto, userId) &&
      previousPhoto !== photoPath
    ) {
      await removeQuietly(storage, previousPhoto, "the previous profile photo");
    }

    if (
      previousThumbnail &&
      isPhotoPathOwnedBy(previousThumbnail, userId) &&
      previousThumbnail !== thumbnailPath
    ) {
      await removeQuietly(storage, previousThumbnail, "the previous thumbnail");
    }

    return {
      ok: true,
      width: processed.width,
      height: processed.height,
    };
  } catch (error) {
    const statusCode =
      typeof error?.statusCode === "number" ? error.statusCode : 500;

    if (statusCode >= 500) {
      console.error("Failed to store the profile photo:", error);
    }

    // The new objects are only removed when the change was not committed. A
    // photo that the database points at is never removed.
    if (!committed) {
      await removeQuietly(storage, uploadedPhotoPath, "the new profile photo");
      await removeQuietly(storage, uploadedThumbnailPath, "the new thumbnail");
    }

    return {
      ok: false,
      statusCode,
      error:
        statusCode === 413
          ? "The photo is too large"
          : statusCode === 400
            ? "The photo could not be processed"
            : "The photo could not be stored",
    };
  }
}

/**
 * Removes the photo of a cadet.
 *
 * The pointer of the profile and the audit event are changed in one
 * transaction. The objects of the storage are removed after the transaction,
 * so a failure of the removal never leaves the profile pointing at an object
 * that is gone.
 *
 * @param {{
 *   db: any,
 *   storage: PhotoStorage,
 *   userId: string,
 * }} input
 * @returns {Promise<PhotoResult & { alreadyEmpty?: boolean }>}
 */
export async function removeProfilePhoto({ db, storage, userId }) {
  try {
    const profile = await loadProfile(db, userId);

    if (!profile) {
      return {
        ok: false,
        statusCode: 404,
        error: "Cadet profile not found",
      };
    }

    await runInTransaction(db, async (tx) => {
      await tx.cadetProfile.update({
        where: { userId },
        data: { photoUrl: null, photoThumbnailUrl: null },
      });

      await writeAuditEvent(tx, {
        actorId: userId,
        action: "PROFILE_PHOTO_REMOVED",
        entity: "CadetProfile",
        entityId: profile.id,
        oldData: { changedFields: ["photoUrl", "photoThumbnailUrl"] },
        newData: { changedFields: ["photoUrl", "photoThumbnailUrl"] },
      });
    });

    for (const path of [profile.photoUrl, profile.photoThumbnailUrl]) {
      if (path && isPhotoPathOwnedBy(path, userId)) {
        await removeQuietly(storage, path, "the profile photo");
      }
    }

    return { ok: true, width: 0, height: 0, alreadyEmpty: !profile.photoUrl };
  } catch (error) {
    console.error("Failed to remove the profile photo:", error);

    return {
      ok: false,
      statusCode: 500,
      error: "The photo could not be removed",
    };
  }
}
