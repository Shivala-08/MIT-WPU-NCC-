import sharp from "sharp";

/**
 * Image pipeline for profile photos.
 *
 * The uploaded file is re-encoded, which validates the content again and
 * removes every EXIF block (the camera serial, the GPS position and the
 * capture date are personal data that must not be stored). The result is a
 * 512 px square WebP plus a 96 px thumbnail.
 */

export const PROFILE_PHOTO_SIZE = 512;
export const PROFILE_PHOTO_THUMBNAIL_SIZE = 96;
export const PROFILE_PHOTO_QUALITY = 82;

/** A hard limit on the number of pixels an uploaded file may expand to. */
const MAX_INPUT_PIXELS = 40_000_000;

export type ProcessedProfilePhoto = {
  photo: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
};

export async function processProfilePhoto(
  bytes: Uint8Array
): Promise<ProcessedProfilePhoto> {
  const pipeline = sharp(bytes, {
    limitInputPixels: MAX_INPUT_PIXELS,
    failOn: "error",
  }).rotate();

  const photo = await pipeline
    .clone()
    .resize(PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE, {
      fit: "cover",
      position: "centre",
    })
    .webp({ quality: PROFILE_PHOTO_QUALITY })
    .toBuffer();

  const thumbnail = await pipeline
    .clone()
    .resize(PROFILE_PHOTO_THUMBNAIL_SIZE, PROFILE_PHOTO_THUMBNAIL_SIZE, {
      fit: "cover",
      position: "centre",
    })
    .webp({ quality: PROFILE_PHOTO_QUALITY })
    .toBuffer();

  const metadata = await sharp(bytes, {
    limitInputPixels: MAX_INPUT_PIXELS,
  }).metadata();

  return {
    photo,
    thumbnail,
    width: metadata.width ?? PROFILE_PHOTO_SIZE,
    height: metadata.height ?? PROFILE_PHOTO_SIZE,
  };
}
