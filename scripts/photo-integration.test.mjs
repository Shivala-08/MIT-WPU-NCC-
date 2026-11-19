/**
 * The profile photo against a real PostgreSQL and a failing storage.
 *
 * The suite proves the recovery of the replacement and of the removal:
 *
 *   * a storage that refuses the write leaves the old photo in place and
 *     removes the new objects;
 *   * a database that refuses the change leaves the old photo in place and
 *     removes the new objects;
 *   * a storage that refuses the removal of the old object leaves the new
 *     photo in place, because the database already points at it;
 *   * the removal of a photo writes the pointer and the audit event in one
 *     transaction and removes the objects afterwards.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  createAccount,
  createProfile,
  fixturePrefix,
  openIntegrationDatabase,
  readAuditEvents,
  removeFixtures,
  withFailingProfileUpdate,
} from "./helpers/integration.mjs";

import {
  removeProfilePhoto,
  replaceProfilePhoto,
} from "../src/lib/profile-photo-service.mjs";

const STORAGE_ROOT = resolve(
  process.cwd(),
  ".local-storage",
  "integration-profile-photos"
);

/**
 * A storage that keeps the objects in the memory of the test.
 *
 * @param {{ failPut?: boolean, failRemove?: boolean }} [options]
 * @returns {any}
 */
function createMemoryStorage(options = {}) {
  const objects = options.objects ?? new Map();

  return {
    objects,
    async put(path, bytes) {
      if (options.failPut) {
        throw new Error("The storage refused the write");
      }

      objects.set(path, bytes);
      return true;
    },
    async remove(path) {
      if (options.failRemove) {
        throw new Error("The storage refused the removal");
      }

      objects.delete(path);
      return true;
    },
    async read(path) {
      const bytes = objects.get(path);

      return bytes
        ? { ok: true, bytes, contentType: "image/webp" }
        : { ok: false };
    },
  };
}

/**
 * A valid PNG image.
 *
 * @returns {Promise<Buffer>}
 */
async function sampleImage() {
  const { default: sharp } = await import("sharp");

  return sharp({
    create: {
      width: 48,
      height: 48,
      channels: 3,
      background: { r: 20, g: 40, b: 90 },
    },
  })
    .png()
    .toBuffer();
}

/**
 * The image pipeline of the suite.
 *
 * The pipeline is injected into the service, so the service does not depend
 * on the image library and the test can prove the recovery of a failure
 * without a server.
 *
 * @returns {Promise<(bytes: Uint8Array) => Promise<{
 *   photo: Uint8Array,
 *   thumbnail: Uint8Array,
 *   width: number,
 *   height: number,
 * }>>}
 */
async function buildProcessor() {
  const { default: sharp } = await import("sharp");

  return async (bytes) => {
    const pipeline = sharp(Buffer.from(bytes), {
      limitInputPixels: 40_000_000,
      failOn: "error",
    }).rotate();

    const photo = await pipeline
      .clone()
      .resize(512, 512, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();

    const thumbnail = await pipeline
      .clone()
      .resize(96, 96, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();

    const metadata = await sharp(Buffer.from(bytes)).metadata();

    return {
      photo: new Uint8Array(photo),
      thumbnail: new Uint8Array(thumbnail),
      width: metadata.width ?? 512,
      height: metadata.height ?? 512,
    };
  };
}

/**
 * @param {(context: { prisma: any, prefix: string }) => Promise<void>} run
 * @returns {Promise<{ skip: string | null }>}
 */
async function withDatabase(run) {
  const opened = await openIntegrationDatabase();

  if (opened.skip) {
    return { skip: opened.skip };
  }

  const { prisma } = opened;
  const prefix = fixturePrefix("photo");

  try {
    await run({ prisma, prefix });
  } finally {
    await removeFixtures(prisma, prefix).catch(() => undefined);
    await prisma.$disconnect();
    await rm(STORAGE_ROOT, { recursive: true, force: true }).catch(
      () => undefined
    );
  }

  return { skip: null };
}

test("a replacement writes the new objects and points the profile at them", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const cadet = await createAccount(prisma, {
      email: `${prefix}-cadet@mitwpu.edu.in`,
      approvalStatus: "APPROVED",
    });

    const profile = await createProfile(prisma, cadet.id);

    const storage = createMemoryStorage();
    const processor = await buildProcessor();
    const bytes = await sampleImage();

    const result = await replaceProfilePhoto({
      db: prisma,
      processor,
      storage,
      userId: cadet.id,
      bytes: new Uint8Array(bytes),
      declaredType: "image/png",
      size: bytes.length,
    });

    assert.equal(result.ok, true);
    assert.ok(result.width > 0);
    assert.ok(result.height > 0);

    const stored = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

    assert.ok(stored.photoUrl);
    assert.ok(stored.photoThumbnailUrl);
    assert.ok(stored.photoUrl.startsWith(`profiles/${cadet.id}/`));
    assert.ok(storage.objects.has(stored.photoUrl));
    assert.ok(storage.objects.has(stored.photoThumbnailUrl));

    // The replacement is in the audit trail and the trail has no path of the
    // storage.
    const events = await readAuditEvents(prisma, {
      action: "PROFILE_PHOTO_UPDATED",
      entityId: profile.id,
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].entity, "CadetProfile");
    assert.ok(
      !JSON.stringify(events[0]).includes(stored.photoUrl),
      "the trail never stores the private path of the object"
    );
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a storage that refuses the write leaves the old photo in place", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const cadet = await createAccount(prisma, {
      email: `${prefix}-cadet@mitwpu.edu.in`,
      approvalStatus: "APPROVED",
    });

    await createProfile(prisma, cadet.id);

    const storage = createMemoryStorage();
    const processor = await buildProcessor();
    const bytes = await sampleImage();

    const first = await replaceProfilePhoto({
      db: prisma,
      processor,
      storage,
      userId: cadet.id,
      bytes: new Uint8Array(bytes),
      declaredType: "image/png",
      size: bytes.length,
    });

    assert.equal(first.ok, true);

    const before = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

    // The storage refuses the second upload.
    const failing = createMemoryStorage({ failPut: true });

    const second = await replaceProfilePhoto({
      db: prisma,
      processor,
      storage: failing,
      processor,
      userId: cadet.id,
      bytes: new Uint8Array(bytes),
      declaredType: "image/png",
      size: bytes.length,
    });

    assert.equal(second.ok, false);
    assert.equal(second.statusCode, 500);

    const after = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

    assert.equal(after.photoUrl, before.photoUrl, "the old photo is still there");
    assert.equal(after.photoThumbnailUrl, before.photoThumbnailUrl);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a database that refuses the change leaves the old photo in place and removes the new objects", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const cadet = await createAccount(prisma, {
      email: `${prefix}-cadet@mitwpu.edu.in`,
      approvalStatus: "APPROVED",
    });

    await createProfile(prisma, cadet.id);

    const storage = createMemoryStorage();
    const processor = await buildProcessor();
    const bytes = await sampleImage();

    const first = await replaceProfilePhoto({
      db: prisma,
      processor,
      storage,
      userId: cadet.id,
      bytes: new Uint8Array(bytes),
      declaredType: "image/png",
      size: bytes.length,
    });

    assert.equal(first.ok, true);

    const before = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

    const objectsBefore = storage.objects.size;

    // The database refuses the change of the pointer.
    const failing = withFailingProfileUpdate(prisma);

    const second = await replaceProfilePhoto({
      db: failing,
      processor,
      storage,
      userId: cadet.id,
      bytes: new Uint8Array(bytes),
      declaredType: "image/png",
      size: bytes.length,
    });

    assert.equal(second.ok, false);
    assert.equal(second.statusCode, 500);

    const after = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

    assert.equal(after.photoUrl, before.photoUrl, "the old photo is still there");
    assert.equal(after.photoThumbnailUrl, before.photoThumbnailUrl);

    // The new objects were removed, the old ones are still in the storage.
    assert.equal(
      storage.objects.size,
      objectsBefore,
      "the new objects were removed after the failed change"
    );
    assert.ok(storage.objects.has(before.photoUrl));
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a storage that refuses the removal of the old object keeps the new photo", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const cadet = await createAccount(prisma, {
      email: `${prefix}-cadet@mitwpu.edu.in`,
      approvalStatus: "APPROVED",
    });

    await createProfile(prisma, cadet.id);

    const bytes = await sampleImage();
    const processor = await buildProcessor();

    const storage = createMemoryStorage();

    const first = await replaceProfilePhoto({
      db: prisma,
      processor,
      storage,
      userId: cadet.id,
      bytes: new Uint8Array(bytes),
      declaredType: "image/png",
      size: bytes.length,
    });

    assert.equal(first.ok, true);

    const before = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

    // The storage refuses every removal from now on. The objects of the two
    // storages are the same, so the old object is really still there.
    const failing = createMemoryStorage({
      failRemove: true,
      objects: storage.objects,
    });

    const second = await replaceProfilePhoto({
      db: prisma,
      processor,
      storage: failing,
      processor,
      userId: cadet.id,
      bytes: new Uint8Array(bytes),
      declaredType: "image/png",
      size: bytes.length,
    });

    assert.equal(second.ok, true, "the replacement itself succeeded");

    const after = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

    assert.notEqual(after.photoUrl, before.photoUrl);
    assert.ok(
      failing.objects.has(after.photoUrl),
      "the new object is in the storage"
    );
    assert.ok(
      failing.objects.has(before.photoUrl),
      "the old object stayed behind, which is harmless"
    );
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a removal clears the pointer, writes the audit event and removes the objects", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const cadet = await createAccount(prisma, {
      email: `${prefix}-cadet@mitwpu.edu.in`,
      approvalStatus: "APPROVED",
    });

    const profile = await createProfile(prisma, cadet.id);

    const storage = createMemoryStorage();
    const processor = await buildProcessor();
    const bytes = await sampleImage();

    const uploaded = await replaceProfilePhoto({
      db: prisma,
      processor,
      storage,
      userId: cadet.id,
      bytes: new Uint8Array(bytes),
      declaredType: "image/png",
      size: bytes.length,
    });

    assert.equal(uploaded.ok, true);

    const removed = await removeProfilePhoto({
      db: prisma,
      storage,
      userId: cadet.id,
    });

    assert.equal(removed.ok, true);

    const after = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

    assert.equal(after.photoUrl, null);
    assert.equal(after.photoThumbnailUrl, null);

    assert.equal(storage.objects.size, 0, "the objects were removed");

    const events = await readAuditEvents(prisma, {
      action: "PROFILE_PHOTO_REMOVED",
      entityId: profile.id,
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].entity, "CadetProfile");
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a database that refuses the removal keeps the photo of the cadet", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const cadet = await createAccount(prisma, {
      email: `${prefix}-cadet@mitwpu.edu.in`,
      approvalStatus: "APPROVED",
    });

    await createProfile(prisma, cadet.id);

    const storage = createMemoryStorage();
    const processor = await buildProcessor();
    const bytes = await sampleImage();

    await replaceProfilePhoto({
      db: prisma,
      processor,
      storage,
      userId: cadet.id,
      bytes: new Uint8Array(bytes),
      declaredType: "image/png",
      size: bytes.length,
    });

    const before = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

    const failing = withFailingProfileUpdate(prisma);

    const removed = await removeProfilePhoto({
      db: failing,
      storage,
      userId: cadet.id,
    });

    assert.equal(removed.ok, false);
    assert.equal(removed.statusCode, 500);

    const after = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true, photoThumbnailUrl: true },
    });

    assert.equal(after.photoUrl, before.photoUrl, "the photo is still there");
    assert.ok(storage.objects.has(before.photoUrl));
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("a file that is not an image and a file that is too large are refused", async (t) => {
  const outcome = await withDatabase(async ({ prisma, prefix }) => {
    const cadet = await createAccount(prisma, {
      email: `${prefix}-cadet@mitwpu.edu.in`,
      approvalStatus: "APPROVED",
    });

    await createProfile(prisma, cadet.id);

    const storage = createMemoryStorage();
    const processor = await buildProcessor();

    const text = await replaceProfilePhoto({
      db: prisma,
      processor,
      storage,
      userId: cadet.id,
      bytes: new Uint8Array([0x74, 0x65, 0x78, 0x74, 0x20, 0x66, 0x69, 0x6c]),
      declaredType: "image/jpeg",
      size: 8,
    });

    assert.equal(text.ok, false);
    assert.equal(text.statusCode, 400);

    const oversized = await replaceProfilePhoto({
      db: prisma,
      processor,
      storage,
      userId: cadet.id,
      bytes: new Uint8Array(5 * 1024 * 1024 + 1),
      declaredType: "image/png",
      size: 5 * 1024 * 1024 + 1,
    });

    assert.equal(oversized.ok, false);
    assert.equal(oversized.statusCode, 413);

    const stored = await prisma.cadetProfile.findUnique({
      where: { userId: cadet.id },
      select: { photoUrl: true },
    });

    assert.equal(stored.photoUrl, null, "nothing was stored");
    assert.equal(storage.objects.size, 0);
  });

  if (outcome.skip) {
    t.skip(outcome.skip);
    return;
  }
});

test("the local photo folder of the development machine is outside the public folder", () => {
  const publicDirectory = resolve(process.cwd(), "public");
  const localDirectory = resolve(process.cwd(), ".local-storage");

  assert.ok(!localDirectory.startsWith(`${publicDirectory}/`));
  assert.ok(!existsSync(join(publicDirectory, ".local-storage")));
});

test("an oversized upload is refused while it is read and not after it was buffered", async () => {
  const { readMultipartBody } = await import("../src/lib/http-body.mjs");
  const { PROFILE_PHOTO_MAX_REQUEST_BYTES } = await import(
    "../src/lib/profile-photo.mjs"
  );

  const chunk = new Uint8Array(256 * 1024);
  const chunkCount = 64;
  let produced = 0;

  // The body is a stream. The suite counts the bytes that the server really
  // took, so it can prove that the rest of the body was never buffered.
  const body = new ReadableStream({
    pull(controller) {
      if (produced >= chunkCount) {
        controller.close();
        return;
      }

      produced += 1;
      controller.enqueue(chunk);
    },
  });

  const request = new Request("http://localhost:3001/api/profile/photo", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=probe" },
    body,
    // The length is not announced, so the limit has to be enforced while the
    // body is read.
    duplex: "half",
  });

  await assert.rejects(
    () => readMultipartBody(request, PROFILE_PHOTO_MAX_REQUEST_BYTES),
    (error) => {
      assert.equal(error.statusCode, 413);
      return true;
    }
  );

  const buffered = produced * chunk.byteLength;

  assert.ok(
    buffered <= PROFILE_PHOTO_MAX_REQUEST_BYTES + chunk.byteLength,
    `the server buffered ${buffered} bytes, which is more than the limit`
  );
  assert.ok(
    produced < chunkCount,
    "the stream was stopped before the whole body was sent"
  );
});

test("a body that announces a length that is too large is refused without reading it", async () => {
  const { readMultipartBody } = await import("../src/lib/http-body.mjs");
  const { PROFILE_PHOTO_MAX_REQUEST_BYTES } = await import(
    "../src/lib/profile-photo.mjs"
  );

  let readerRequested = false;

  // The announced length is larger than the limit, so the body must never be
  // read at all.
  const request = {
    headers: new Headers({
      "content-type": "multipart/form-data; boundary=probe",
      "content-length": String(PROFILE_PHOTO_MAX_REQUEST_BYTES + 1),
    }),
    body: {
      getReader() {
        readerRequested = true;
        throw new Error("the body must not be read");
      },
    },
    async arrayBuffer() {
      throw new Error("the body must not be read");
    },
  };

  await assert.rejects(
    () => readMultipartBody(request, PROFILE_PHOTO_MAX_REQUEST_BYTES),
    (error) => {
      assert.equal(error.statusCode, 413);
      return true;
    }
  );

  assert.equal(readerRequested, false, "the body was never read");
});
