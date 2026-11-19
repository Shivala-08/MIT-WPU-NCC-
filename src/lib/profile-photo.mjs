import { randomUUID } from "node:crypto";

/**
 * Validation rules for profile photos.
 *
 * A profile photo is personal data, so the rules are deliberately strict:
 * only three raster formats are accepted, the size is capped, the file
 * content has to match the declared media type and the object name is always
 * generated on the server.
 */

export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The largest request body that is read for a photo upload.
 *
 * The limit of the image itself is five megabytes. A multipart request
 * carries the boundary and the headers of the part around the image, so the
 * request is allowed to be a little larger than the image. The slack is
 * small, so a request with a large body is refused while it is read and not
 * after it was buffered completely.
 */
export const PROFILE_PHOTO_MAX_REQUEST_BYTES = PROFILE_PHOTO_MAX_BYTES + 64 * 1024;

/**
 * @type {Readonly<Record<string, string>>}
 */
export const PROFILE_PHOTO_ALLOWED_TYPES = Object.freeze({
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
});

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAllowedPhotoType(value) {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PROFILE_PHOTO_ALLOWED_TYPES, value)
  );
}

/**
 * Detects the real image format from the file content.
 *
 * @param {Uint8Array} bytes
 * @returns {"jpeg" | "png" | "webp" | null}
 */
export function detectPhotoContentType(bytes) {
  if (!bytes || bytes.length < 12) {
    return null;
  }

  const isJpeg =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  if (isJpeg) {
    return "jpeg";
  }

  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  if (isPng) {
    return "png";
  }

  const isRiff =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;

  const isWebp =
    isRiff &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (isWebp) {
    return "webp";
  }

  return null;
}

/**
 * @typedef {{
 *   ok: true,
 *   contentType: "image/jpeg" | "image/png" | "image/webp",
 *   format: "jpeg" | "png" | "webp",
 *   size: number,
 * } | { ok: false, error: string, code: string }} PhotoValidation
 */

/**
 * Validates an uploaded profile photo.
 *
 * @param {{
 *   bytes: Uint8Array,
 *   declaredType?: unknown,
 *   size?: number,
 *   maxBytes?: number,
 * }} input
 * @returns {PhotoValidation}
 */
export function validateProfilePhoto({
  bytes,
  declaredType,
  size,
  maxBytes = PROFILE_PHOTO_MAX_BYTES,
}) {
  const length = typeof size === "number" ? size : bytes?.length ?? 0;

  if (!bytes || length === 0) {
    return { ok: false, error: "The uploaded file is empty", code: "EMPTY" };
  }

  if (length > maxBytes) {
    return {
      ok: false,
      error: `The photo must be smaller than ${Math.floor(maxBytes / (1024 * 1024))} MB`,
      code: "TOO_LARGE",
    };
  }

  const declared = typeof declaredType === "string" ? declaredType : "";

  if (!isAllowedPhotoType(declared)) {
    return {
      ok: false,
      error:
        "Only JPEG, PNG and WebP images are accepted. SVG and other active content are refused.",
      code: "UNSUPPORTED_TYPE",
    };
  }

  const detected = detectPhotoContentType(bytes);

  if (!detected) {
    return {
      ok: false,
      error:
        "The file content is not a supported image. The file was rejected.",
      code: "INVALID_CONTENT",
    };
  }

  if (PROFILE_PHOTO_ALLOWED_TYPES[declared] !== detected) {
    return {
      ok: false,
      error:
        "The file content does not match the declared image type. The file was rejected.",
      code: "CONTENT_TYPE_MISMATCH",
    };
  }

  const contentType =
    detected === "jpeg"
      ? "image/jpeg"
      : detected === "png"
        ? "image/png"
        : "image/webp";

  return { ok: true, contentType, format: detected, size: length };
}

/**
 * Builds the storage object names of a profile photo.
 *
 * The client never chooses a path: the names are random and are scoped to
 * the owner of the profile.
 *
 * @param {string} userId
 * @returns {{ photoPath: string, thumbnailPath: string }}
 */
export function buildPhotoObjectNames(userId) {
  const owner = String(userId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");

  if (!owner) {
    throw new Error("A user id is required to store a profile photo");
  }

  const token = randomUUID().replace(/-/g, "");

  return {
    photoPath: `profiles/${owner}/${token}.webp`,
    thumbnailPath: `profiles/${owner}/${token}-thumb.webp`,
  };
}

/**
 * Checks that a stored object path belongs to the expected owner.
 *
 * @param {unknown} path
 * @param {string} userId
 * @returns {boolean}
 */
export function isPhotoPathOwnedBy(path, userId) {
  if (typeof path !== "string" || path.length === 0) {
    return false;
  }

  const owner = String(userId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  const prefix = `profiles/${owner}/`;

  return path.startsWith(prefix) && !path.includes("..");
}
