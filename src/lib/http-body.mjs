/**
 * The bounded reading of a request body.
 *
 * The module has no dependency on the framework, so the rules of the limit
 * can be proved by the test suite without a server. The route of the
 * application uses the same functions.
 *
 * The body is read in chunks and the reader is stopped as soon as the limit
 * is reached. A request that is too large is therefore refused while it is
 * read and the server never holds a body that is larger than the limit in
 * its memory.
 */

export function payloadTooLargeError() {
  const error = new Error("The request body is too large");
  error.statusCode = 413;
  return error;
}

/**
 * The error of a body that is not of the expected media type.
 */
export function unsupportedMediaTypeError() {
  const error = new Error("The request has to be application/json");
  error.statusCode = 415;
  return error;
}

/**
 * Decides whether a Content-Type header names JSON.
 *
 * The parameters after the type are ignored, so
 * `application/json; charset=utf-8` is accepted. The comparison is case
 * insensitive because the media type is defined that way.
 *
 * @param {string | null} value
 * @returns {boolean}
 */
export function isJsonContentType(value) {
  if (typeof value !== "string") {
    return false;
  }

  const mediaType = value.split(";")[0].trim().toLowerCase();

  if (mediaType === "application/json") {
    return true;
  }

  // A JSON suffix is still JSON, for example application/ld+json.
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+\+json$/.test(mediaType);
}

/**
 * Throws unless the request declares a JSON body.
 *
 * The check reads a header only. It never touches the body, so a request of
 * the wrong media type is refused before a single byte is read.
 *
 * @param {Request} req
 */
export function assertJsonContentType(req) {
  if (!isJsonContentType(req.headers.get("content-type"))) {
    throw unsupportedMediaTypeError();
  }
}

/**
 * Reads the body of a request with a hard limit.
 *
 * @param {Request} req
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 */
export async function readBodyWithLimit(req, maxBytes) {
  const length = Number(req.headers.get("content-length") ?? 0);

  if (Number.isFinite(length) && length > maxBytes) {
    throw payloadTooLargeError();
  }

  const body = req.body;

  if (!body) {
    // No stream is available, so no reader exists to stop early. The whole
    // body has to be materialised before its size is known. The limit is
    // still enforced on the result, so this path cannot return a body above
    // the limit; it only loses the property that an oversized body is refused
    // before it is fully buffered.
    const buffer = Buffer.from(await req.arrayBuffer());

    if (buffer.byteLength > maxBytes) {
      throw payloadTooLargeError();
    }

    return buffer;
  }

  const reader = body.getReader();
  const chunks = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      total += value.byteLength;

      if (total > maxBytes) {
        // The body is refused while it is read. The rest of the body is never
        // buffered.
        throw payloadTooLargeError();
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    // The lock is always released, whether the read finished, the limit was
    // exceeded or the reader itself failed.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total);
}

/**
 * Reads a multipart request with a hard limit.
 *
 * The body is read with a limit and is only parsed after it was read. A
 * request that is larger than the limit is refused with 413 and the server
 * never buffers the whole body of an oversized upload.
 *
 * @param {Request} req
 * @param {number} maxBytes
 * @returns {Promise<FormData>}
 */
export async function readMultipartBody(req, maxBytes) {
  const contentType = req.headers.get("content-type") ?? "";
  const bytes = await readBodyWithLimit(req, maxBytes);

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    const error = new Error("The request has to be a multipart form");
    error.statusCode = 400;
    throw error;
  }

  let form;

  try {
    form = await new Response(bytes, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    const error = new Error("The multipart body could not be read");
    error.statusCode = 400;
    throw error;
  }

  return form;
}
