import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PROFILE_PHOTO_ALLOWED_TYPES,
  PROFILE_PHOTO_MAX_BYTES,
  buildPhotoObjectNames,
  detectPhotoContentType,
  isPhotoPathOwnedBy,
  validateProfilePhoto,
} from "../src/lib/profile-photo.mjs";

const jpegBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

const textBytes = new Uint8Array([
  0x74, 0x65, 0x78, 0x74, 0x20, 0x66, 0x69, 0x6c, 0x65, 0x00, 0x00, 0x00,
]);

test("the real content of a file decides its type", () => {
  assert.equal(detectPhotoContentType(jpegBytes), "jpeg");
  assert.equal(detectPhotoContentType(pngBytes), "png");
  assert.equal(detectPhotoContentType(webpBytes), "webp");
  assert.equal(detectPhotoContentType(textBytes), null);
});

test("a text file renamed to a jpeg is rejected", () => {
  const result = validateProfilePhoto({
    bytes: textBytes,
    declaredType: "image/jpeg",
    size: textBytes.length,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_CONTENT");
});

test("a file whose content does not match the declared type is rejected", () => {
  const result = validateProfilePhoto({
    bytes: pngBytes,
    declaredType: "image/jpeg",
    size: pngBytes.length,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "CONTENT_TYPE_MISMATCH");
});

test("an svg upload is rejected", () => {
  const svg = new Uint8Array([
    0x3c, 0x73, 0x76, 0x67, 0x20, 0x78, 0x6d, 0x6c, 0x6e, 0x73, 0x3d, 0x22,
  ]);

  const result = validateProfilePhoto({
    bytes: svg,
    declaredType: "image/svg+xml",
    size: svg.length,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "UNSUPPORTED_TYPE");
});

test("an oversized file is rejected", () => {
  const result = validateProfilePhoto({
    bytes: jpegBytes,
    declaredType: "image/jpeg",
    size: PROFILE_PHOTO_MAX_BYTES + 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "TOO_LARGE");
});

test("an empty file is rejected", () => {
  const result = validateProfilePhoto({
    bytes: new Uint8Array(),
    declaredType: "image/jpeg",
    size: 0,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "EMPTY");
});

test("a valid jpeg is accepted", () => {
  const result = validateProfilePhoto({
    bytes: jpegBytes,
    declaredType: "image/jpeg",
    size: jpegBytes.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.contentType, "image/jpeg");
});

test("only three image formats are allowed", () => {
  assert.deepEqual(Object.keys(PROFILE_PHOTO_ALLOWED_TYPES).sort(), [
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
});

test("the storage object names are generated on the server and scoped to the owner", () => {
  const first = buildPhotoObjectNames("user-123");
  const second = buildPhotoObjectNames("user-123");

  assert.notEqual(first.photoPath, second.photoPath);
  assert.match(first.photoPath, /^profiles\/user-123\/[a-f0-9]{32}\.webp$/);
  assert.match(
    first.thumbnailPath,
    /^profiles\/user-123\/[a-f0-9]{32}-thumb\.webp$/
  );
});

test("a stored path of another cadet is never accepted", () => {
  const { photoPath } = buildPhotoObjectNames("user-123");

  assert.equal(isPhotoPathOwnedBy(photoPath, "user-123"), true);
  assert.equal(isPhotoPathOwnedBy(photoPath, "user-456"), false);
  assert.equal(
    isPhotoPathOwnedBy("profiles/user-123/../../secret", "user-123"),
    false
  );
  assert.equal(isPhotoPathOwnedBy(null, "user-123"), false);
});
