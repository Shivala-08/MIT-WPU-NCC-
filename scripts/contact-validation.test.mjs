import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTACT_BODY_MAX_BYTES,
  CONTACT_FIELD_LIMITS,
  ContactValidationError,
  validateContactSubmission,
} from "../src/lib/contact-validation.mjs";
import {
  assertJsonContentType,
  isJsonContentType,
  readBodyWithLimit,
} from "../src/lib/http-body.mjs";

const VALID = {
  name: "Captain Example",
  email: "cadet@example.edu",
  subject: "Enquiry about enrolment",
  message: "I would like to know when the next enrolment window opens.",
};

test("a valid submission is accepted and returned trimmed", () => {
  const result = validateContactSubmission({
    name: "  Captain Example  ",
    email: "  cadet@example.edu  ",
    subject: " Enquiry about enrolment ",
    message: " I would like to know when the next enrolment window opens. ",
  });

  assert.equal(result.name, "Captain Example");
  assert.equal(result.email, "cadet@example.edu");
  assert.equal(result.subject, "Enquiry about enrolment");
  assert.equal(
    result.message,
    "I would like to know when the next enrolment window opens."
  );
});

test("an unknown field is discarded and never stored", () => {
  const result = validateContactSubmission({
    ...VALID,
    isRead: true,
    id: "attacker-supplied",
  });

  assert.deepEqual(Object.keys(result).sort(), [
    "email",
    "message",
    "name",
    "subject",
  ]);
});

test("the body limit is the documented 8 KB", () => {
  assert.equal(CONTACT_BODY_MAX_BYTES, 8_000);
});

test("every field rejects a value above its maximum", () => {
  const cases = Object.entries(CONTACT_FIELD_LIMITS);

  for (const [field, limit] of cases) {
    const value = "a".repeat(limit + 1);

    const input = { ...VALID, [field]: value };

    if (field === "email") {
      input.email = `${"a".repeat(limit)}@example.edu`;
    }

    assert.throws(
      () => validateContactSubmission(input),
      (error) => {
        assert.ok(error instanceof ContactValidationError);
        assert.equal(error.statusCode, 400);
        assert.equal(error.field, field);
        return true;
      },
      `field ${field} must reject more than ${limit} characters`
    );
  }
});

test("every field accepts a value exactly at its maximum", () => {
  const input = {
    name: "a".repeat(CONTACT_FIELD_LIMITS.name),
    email: `${"a".repeat(CONTACT_FIELD_LIMITS.email - "@example.edu".length)}@example.edu`,
    subject: "a".repeat(CONTACT_FIELD_LIMITS.subject),
    message: "a".repeat(CONTACT_FIELD_LIMITS.message),
  };

  const result = validateContactSubmission(input);

  assert.equal(result.name.length, CONTACT_FIELD_LIMITS.name);
  assert.equal(result.email.length, CONTACT_FIELD_LIMITS.email);
  assert.equal(result.subject.length, CONTACT_FIELD_LIMITS.subject);
  assert.equal(result.message.length, CONTACT_FIELD_LIMITS.message);
});

test("a missing field is rejected with the name of the field", () => {
  for (const field of ["name", "email", "subject", "message"]) {
    const input = { ...VALID };
    delete input[field];

    assert.throws(
      () => validateContactSubmission(input),
      (error) => {
        assert.ok(error instanceof ContactValidationError);
        assert.equal(error.field, field);
        return true;
      },
      `a missing ${field} must be rejected`
    );
  }
});

test("a field of the wrong type is rejected", () => {
  assert.throws(
    () => validateContactSubmission({ ...VALID, name: 42 }),
    ContactValidationError
  );

  assert.throws(
    () => validateContactSubmission({ ...VALID, message: ["a", "b"] }),
    ContactValidationError
  );

  assert.throws(
    () => validateContactSubmission({ ...VALID, subject: { text: "hi" } }),
    ContactValidationError
  );
});

test("a blank field is rejected", () => {
  assert.throws(
    () => validateContactSubmission({ ...VALID, name: "    " }),
    ContactValidationError
  );
});

test("a submission that is not an object is rejected", () => {
  for (const input of [null, undefined, "text", 42, [], true]) {
    assert.throws(
      () => validateContactSubmission(input),
      ContactValidationError,
      `input ${JSON.stringify(input)} must be rejected`
    );
  }
});

test("the minimum lengths of the existing form are kept", () => {
  assert.throws(
    () => validateContactSubmission({ ...VALID, name: "A" }),
    ContactValidationError
  );

  assert.throws(
    () => validateContactSubmission({ ...VALID, subject: "Hi" }),
    ContactValidationError
  );

  assert.throws(
    () => validateContactSubmission({ ...VALID, message: "too short" }),
    ContactValidationError
  );
});

test("a clearly malformed e-mail address is rejected", () => {
  const bad = [
    "no-at-sign",
    "@example.edu",
    "cadet@",
    "cadet@example",
    "two@at@example.edu",
    "space in@example.edu",
    "cadet@.edu",
    "cadet@example.",
  ];

  for (const email of bad) {
    assert.throws(
      () => validateContactSubmission({ ...VALID, email }),
      ContactValidationError,
      `${email} must be rejected`
    );
  }
});

test("an acceptable e-mail address is allowed", () => {
  const good = [
    "cadet@example.edu",
    "first.last@mitwpu.edu.in",
    "a+tag@example.co.in",
    "c_1@example.org",
  ];

  for (const email of good) {
    const result = validateContactSubmission({ ...VALID, email });
    assert.equal(result.email, email);
  }
});

// The body limit is enforced while the body is read. A Content-Length header
// that is missing or wrong therefore does not weaken the limit.

function requestWithBody(body, headers = {}) {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

test("a body above the limit is refused with 413", async () => {
  const body = JSON.stringify({ ...VALID, message: "a".repeat(9_000) });

  const error = await readBodyWithLimit(
    requestWithBody(body),
    CONTACT_BODY_MAX_BYTES
  ).then(
    () => null,
    (caught) => caught
  );

  assert.ok(error, "an oversized body must be refused");
  assert.equal(error.statusCode, 413);
});

test("an oversized body is refused even without a Content-Length header", async () => {
  // A stream has no Content-Length, so the limit can only come from the read.
  const encoder = new TextEncoder();
  const chunk = encoder.encode("a".repeat(1_024));

  const stream = new ReadableStream({
    start(controller) {
      for (let index = 0; index < 32; index += 1) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  const request = new Request("http://localhost/api/contact", {
    method: "POST",
    body: stream,
    duplex: "half",
  });

  assert.equal(request.headers.get("content-length"), null);

  const error = await readBodyWithLimit(
    request,
    CONTACT_BODY_MAX_BYTES
  ).then(
    () => null,
    (caught) => caught
  );

  assert.ok(error, "an oversized stream must be refused");
  assert.equal(error.statusCode, 413);
});

test("an oversized body is refused when Content-Length understates the size", async () => {
  const encoder = new TextEncoder();
  const chunk = encoder.encode("a".repeat(1_024));

  const stream = new ReadableStream({
    start(controller) {
      for (let index = 0; index < 32; index += 1) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  const request = new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-length": "10" },
    body: stream,
    duplex: "half",
  });

  const error = await readBodyWithLimit(
    request,
    CONTACT_BODY_MAX_BYTES
  ).then(
    () => null,
    (caught) => caught
  );

  assert.ok(error, "a misleading Content-Length must not bypass the limit");
  assert.equal(error.statusCode, 413);
});

test("a body within the limit is read in full", async () => {
  const body = JSON.stringify(VALID);
  const bytes = await readBodyWithLimit(
    requestWithBody(body),
    CONTACT_BODY_MAX_BYTES
  );

  assert.equal(bytes.toString("utf8"), body);
});

test("malformed JSON is a validation failure, not a server error", async () => {
  const bytes = await readBodyWithLimit(
    requestWithBody('{"name": "broken",'),
    CONTACT_BODY_MAX_BYTES
  );

  assert.throws(
    () => JSON.parse(bytes.toString("utf8")),
    SyntaxError,
    "the parsed body must fail as a syntax error, which the route maps to 400"
  );
});

// The media type is checked from the header alone. A request of the wrong
// type must be refused before a single byte of its body is read.

test("application/json is accepted as a content type", () => {
  assert.equal(isJsonContentType("application/json"), true);
});

test("application/json with a charset parameter is accepted", () => {
  assert.equal(isJsonContentType("application/json; charset=utf-8"), true);
  assert.equal(isJsonContentType("application/json;charset=UTF-8"), true);
  assert.equal(isJsonContentType("Application/JSON; charset=utf-8"), true);
});

test("a json suffix media type is accepted", () => {
  assert.equal(isJsonContentType("application/ld+json"), true);
});

test("text/plain is rejected as a content type", () => {
  assert.equal(isJsonContentType("text/plain"), false);
});

test("application/x-www-form-urlencoded is rejected as a content type", () => {
  assert.equal(isJsonContentType("application/x-www-form-urlencoded"), false);
});

test("a missing content type is rejected", () => {
  assert.equal(isJsonContentType(null), false);
  assert.equal(isJsonContentType(undefined), false);
  assert.equal(isJsonContentType(""), false);
});

test("a submission of the wrong media type is refused with 415", () => {
  for (const contentType of [
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "application/xml",
  ]) {
    const request = requestWithBody("{}", { "content-type": contentType });

    assert.throws(
      () => assertJsonContentType(request),
      (error) => {
        assert.equal(error.statusCode, 415);
        return true;
      },
      `${contentType} must be refused`
    );
  }
});

test("a submission without a content type is refused with 415", () => {
  const request = new Request("http://localhost/api/contact", {
    method: "POST",
    body: "{}",
  });

  // The Request constructor may add a default type; clear it to test the
  // header-absent case the route has to handle.
  const bare = {
    headers: new Headers(),
  };

  assert.equal(bare.headers.get("content-type"), null);

  assert.throws(
    () => assertJsonContentType(bare),
    (error) => {
      assert.equal(error.statusCode, 415);
      return true;
    }
  );

  assert.throws(() => assertJsonContentType(request), (error) => {
    assert.equal(error.statusCode, 415);
    return true;
  });
});

test("a valid content type is not refused", () => {
  assert.doesNotThrow(() =>
    assertJsonContentType(requestWithBody("{}", { "content-type": "application/json" }))
  );

  assert.doesNotThrow(() =>
    assertJsonContentType(
      requestWithBody("{}", { "content-type": "application/json; charset=utf-8" })
    )
  );
});

test("a rejected media type never consumes the body", async () => {
  let pulls = 0;

  const stream = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new TextEncoder().encode("{}"));
      controller.close();
    },
  });

  const request = new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: stream,
    duplex: "half",
  });

  assert.throws(
    () => assertJsonContentType(request),
    (error) => {
      assert.equal(error.statusCode, 415);
      return true;
    }
  );

  assert.equal(
    pulls,
    0,
    "the body must not be pulled at all when the media type is wrong"
  );
});

test("the reader lock is released after a successful read", async () => {
  const body = JSON.stringify(VALID);
  const request = requestWithBody(body);

  await readBodyWithLimit(request, CONTACT_BODY_MAX_BYTES);

  // The stream can be locked again, so the previous reader let go of it.
  assert.equal(request.body.locked, false);
});

test("the reader lock is released after a failed read", async () => {
  const encoder = new TextEncoder();
  const chunk = encoder.encode("a".repeat(1_024));

  const stream = new ReadableStream({
    start(controller) {
      for (let index = 0; index < 32; index += 1) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  const request = new Request("http://localhost/api/contact", {
    method: "POST",
    body: stream,
    duplex: "half",
  });

  const error = await readBodyWithLimit(
    request,
    CONTACT_BODY_MAX_BYTES
  ).then(
    () => null,
    (caught) => caught
  );

  assert.ok(error, "the oversized body must be refused");
  assert.equal(error.statusCode, 413);
  assert.equal(
    request.body.locked,
    false,
    "the reader lock must be released even when the limit is exceeded"
  );
});
