import { NextResponse } from "next/server";

export {
  payloadTooLargeError,
  readBodyWithLimit,
  readMultipartBody,
} from "./http-body.mjs";

export function serviceErrorResponse(
  error: unknown,
  fallback = "The request could not be completed"
) {
  const statusCode =
    typeof (error as { statusCode?: number })?.statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 500;

  if (statusCode >= 500) {
    console.error("Attendance request failed:", error);
  }

  const extra = (error as { errors?: unknown })?.errors;

  return NextResponse.json(
    {
      error:
        statusCode >= 500
          ? fallback
          : ((error as Error)?.message ?? fallback),
      ...(Array.isArray(extra) ? { errors: extra } : {}),
    },
    { status: statusCode }
  );
}

/**
 * Reads the JSON body of a request.
 *
 * An empty body is an empty object and a broken body is a bad request. Both
 * are reported with a clear message instead of an internal server error.
 */
export async function readJsonBody(req: Request, maxBytes = 256_000) {
  const length = Number(req.headers.get("content-length") ?? 0);

  if (Number.isFinite(length) && length > maxBytes) {
    const error = new Error("The request body is too large");
    (error as { statusCode?: number }).statusCode = 413;
    throw error;
  }

  let raw = "";

  try {
    raw = await req.text();
  } catch {
    raw = "";
  }

  if (raw.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("The request body is not valid JSON");
    (error as { statusCode?: number }).statusCode = 400;
    throw error;
  }
}

export function queryString(req: Request, name: string) {
  const value = new URL(req.url).searchParams.get(name);

  return value && value.trim().length > 0 ? value.trim() : null;
}

export function parseDateQuery(value: string | null) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  return value;
}
