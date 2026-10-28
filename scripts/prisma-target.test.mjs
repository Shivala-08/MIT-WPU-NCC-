import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSafeDatabaseTarget,
  classifyDatabaseTarget,
  describeDatabaseTarget,
  redactDatabaseUrl,
} from "../src/lib/prisma-target.mjs";

const PROD_REF = "abc123def456ghi789";
const PROD_PASSWORD = "super-secret-password-value";
const PROD_URL = `postgresql://postgres.${PROD_REF}:${PROD_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const LOCAL_URL = "postgresql://pallav@127.0.0.1:5432/ncc_dev?schema=public";

test("classifies a local PostgreSQL target as local", () => {
  const target = classifyDatabaseTarget(LOCAL_URL, { env: {} });
  assert.equal(target.kind, "local");
  assert.equal(target.host, "127.0.0.1");
  assert.equal(target.database, "ncc_dev");

  assert.equal(
    classifyDatabaseTarget("postgresql://u:p@localhost:5432/ncc_dev", { env: {} }).kind,
    "local"
  );
  assert.equal(
    classifyDatabaseTarget("postgresql://u:p@[::1]:5432/ncc_dev", { env: {} }).kind,
    "local"
  );
});

test("classifies the production Supabase project as production", () => {
  const pooler = classifyDatabaseTarget(PROD_URL, { env: {} });
  assert.equal(pooler.kind, "production");

  const direct = classifyDatabaseTarget(
    `postgresql://postgres:${PROD_PASSWORD}@db.${PROD_REF}.supabase.co:5432/postgres`,
    { env: {} }
  );
  assert.equal(direct.kind, "production");

  const knownRef = classifyDatabaseTarget(PROD_URL, {
    env: { PRISMA_PRODUCTION_PROJECT_REF: PROD_REF },
  });
  assert.equal(knownRef.kind, "production");
});

test("classifies an unknown remote host as unknown", () => {
  const target = classifyDatabaseTarget(
    "postgresql://u:p@db.example.com:5432/app",
    { env: {} }
  );
  assert.equal(target.kind, "unknown");
});

test("classifies missing and malformed values", () => {
  assert.equal(classifyDatabaseTarget(undefined, { env: {} }).kind, "missing");
  assert.equal(classifyDatabaseTarget("", { env: {} }).kind, "missing");
  assert.equal(classifyDatabaseTarget("   ", { env: {} }).kind, "missing");
  assert.equal(classifyDatabaseTarget("not-a-url", { env: {} }).kind, "malformed");
  assert.equal(
    classifyDatabaseTarget("mysql://u:p@127.0.0.1:3306/app", { env: {} }).kind,
    "malformed"
  );
});

test("allows a local target in development mode", () => {
  const result = assertSafeDatabaseTarget({
    url: LOCAL_URL,
    mode: "development",
    env: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.target.kind, "local");
});

test("rejects a production target in development mode", () => {
  assert.throws(
    () =>
      assertSafeDatabaseTarget({
        url: PROD_URL,
        mode: "development",
        env: {},
      }),
    (error) => {
      assert.match(error.message, /Refusing to connect to a production Supabase database/i);
      assert.match(error.message, /PRISMA_ALLOW_PRODUCTION=1/);
      assert.match(error.message, /127\.0\.0\.1:5432\/ncc_dev/);
      return true;
    }
  );
});

test("allows a production target only with explicit authorisation in development mode", () => {
  const result = assertSafeDatabaseTarget({
    url: PROD_URL,
    mode: "development",
    env: { PRISMA_ALLOW_PRODUCTION: "1" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.authorized, true);
});

test("allows a production target in production deployment mode", () => {
  const result = assertSafeDatabaseTarget({
    url: PROD_URL,
    mode: "production",
    env: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.target.kind, "production");
});

test("fails closed for an unknown remote target in every mode", () => {
  const unknownUrl = "postgresql://u:p@db.example.com:5432/app";

  assert.throws(
    () =>
      assertSafeDatabaseTarget({
        url: unknownUrl,
        mode: "development",
        env: {},
      }),
    /cannot be classified safely/i
  );

  assert.throws(
    () =>
      assertSafeDatabaseTarget({
        url: unknownUrl,
        mode: "production",
        env: {},
      }),
    /cannot be classified safely/i
  );

  const authorised = assertSafeDatabaseTarget({
    url: unknownUrl,
    mode: "production",
    env: { PRISMA_ALLOW_UNKNOWN_TARGET: "true" },
  });
  assert.equal(authorised.ok, true);
  assert.equal(authorised.authorized, true);
});

test("fails closed for a missing DATABASE_URL", () => {
  assert.throws(
    () =>
      assertSafeDatabaseTarget({
        url: undefined,
        mode: "development",
        env: {},
      }),
    /DATABASE_URL is not set/i
  );
});

test("fails closed for a malformed DATABASE_URL", () => {
  assert.throws(
    () =>
      assertSafeDatabaseTarget({
        url: "not-a-url",
        mode: "development",
        env: {},
      }),
    /not a parsable connection URL/i
  );

  assert.throws(
    () =>
      assertSafeDatabaseTarget({
        url: "mysql://u:p@127.0.0.1:3306/app",
        mode: "development",
        env: {},
      }),
    /unsupported protocol/i
  );
});

test("redacts credentials in labels, errors and logs", () => {
  const redacted = redactDatabaseUrl(PROD_URL);
  assert.ok(!redacted.includes(PROD_PASSWORD));
  assert.ok(!redacted.includes(PROD_REF));
  assert.match(redacted, /^postgresql:\/\/\*\*\*@/);
  assert.match(redacted, /pooler\.supabase\.com:5432\/postgres$/);

  assert.equal(redactDatabaseUrl(undefined), "(not set)");
  assert.equal(redactDatabaseUrl("not-a-url"), "(malformed value)");

  const target = classifyDatabaseTarget(PROD_URL, { env: {} });
  const description = describeDatabaseTarget(target);
  assert.ok(!description.includes(PROD_PASSWORD));
  assert.ok(!description.includes(PROD_REF));
  assert.ok(!description.includes("postgresql://"));

  assert.throws(
    () =>
      assertSafeDatabaseTarget({
        url: PROD_URL,
        mode: "development",
        env: {},
      }),
    (error) => {
      assert.ok(!error.message.includes(PROD_URL));
      assert.ok(!error.message.includes(PROD_PASSWORD));
      assert.ok(!error.message.includes(PROD_REF));
      assert.ok(!error.message.includes(`postgres.${PROD_REF}`));
      assert.ok(!error.message.includes(`:${PROD_PASSWORD}@`));
      return true;
    }
  );

  assert.throws(
    () =>
      assertSafeDatabaseTarget({
        url: "not-a-url",
        mode: "development",
        env: {},
      }),
    (error) => {
      assert.ok(!error.message.includes("not-a-url"));
      return true;
    }
  );
});
