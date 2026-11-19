import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  assertJsonContentType,
  readBodyWithLimit,
} from "@/lib/http-body.mjs";
import {
  CONTACT_BODY_MAX_BYTES,
  ContactValidationError,
  validateContactSubmission,
} from "@/lib/contact-validation.mjs";

/**
 * The one error shape of this route.
 *
 * The message is safe to show: it never contains a stack trace, a database
 * detail or any part of the submission.
 */
function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Reads the body with a hard limit and parses it as JSON.
 *
 * The limit is enforced while the body is read, so a request without a
 * Content-Length header, or with a header that understates the real size, is
 * still refused before the whole body is buffered.
 */
async function readBoundedJson(req: Request) {
  const bytes = await readBodyWithLimit(req, CONTACT_BODY_MAX_BYTES);

  if (bytes.byteLength === 0) {
    return {};
  }

  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ContactValidationError("The request body is not valid JSON");
  }
}

export async function POST(req: Request) {
  // The media type is checked from the header alone, so a request of the
  // wrong type is refused before a single byte of its body is read.
  try {
    assertJsonContentType(req);
  } catch {
    return errorResponse("The request has to be application/json", 415);
  }

  let body: unknown;

  try {
    body = await readBoundedJson(req);
  } catch (error: unknown) {
    const status =
      typeof (error as { statusCode?: number })?.statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 400;

    if (status === 413) {
      return errorResponse("The message is too large", 413);
    }

    return errorResponse(
      error instanceof ContactValidationError
        ? error.message
        : "The request body could not be read",
      400
    );
  }

  let validated;

  try {
    validated = validateContactSubmission(body);
  } catch (error: unknown) {
    if (error instanceof ContactValidationError) {
      return errorResponse(error.message, 400);
    }

    console.error("Contact validation error:", error);
    return errorResponse("Thank you, but the message could not be accepted", 400);
  }

  try {
    const message = await prisma.contactMessage.create({
      data: {
        name: validated.name,
        email: validated.email,
        subject: validated.subject,
        message: validated.message,
      },
    });

    return NextResponse.json(
      { success: true, messageId: message.id },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Contact submission error:", error);

    return errorResponse("Failed to send message. Please try again.", 500);
  }
}
