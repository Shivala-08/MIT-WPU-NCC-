import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  createPrismaClient,
  loadSuiteContext,
  requireDatabase,
} from "./helpers/db-suite.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const MIGRATION_PATH = join(
  REPO_ROOT,
  "prisma/migrations/20261030080432_phase3_attendance_operations/migration.sql"
);

const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

/**
 * The migration safety of the phase 3.
 *
 * The static part of this file checks the migration itself: it never guesses a
 * historical value and its comments describe what it really does.
 *
 * The behavioural part runs the statements of the migration against a real
 * PostgreSQL. It uses a schema of its own and rolls the transaction back
 * every time, so the database of the developer is never changed.
 */

function loadContext() {
  const context = loadSuiteContext({ requireSecret: false });

  if (context.skip) {
    return context;
  }

  return context;
}

/**
 * Opens the Prisma client of the local database and proves that it answers.
 *
 * The suite needs a real PostgreSQL. A database that does not answer is a
 * failure and not a skip: a skipped suite would report a green result while
 * it proved nothing.
 */
async function openDatabase(context) {
  const prisma = await createPrismaClient(context.env);

  try {
    await requireDatabase(prisma);
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    throw error;
  }

  return prisma;
}

/**
 * Extracts the DO block that follows a marker of the migration.
 */
function extractDoBlock(marker) {
  const markerIndex = MIGRATION.indexOf(marker);

  assert.notEqual(markerIndex, -1, `the migration does not contain "${marker}"`);

  const start = MIGRATION.indexOf("DO $$", markerIndex);
  const end = MIGRATION.indexOf("$$;", start);

  assert.notEqual(start, -1, `the migration does not contain a DO block for "${marker}"`);
  assert.notEqual(end, -1, `the DO block of "${marker}" is not closed`);

  return MIGRATION.slice(start, end + 3);
}

/**
 * Extracts the statement that follows a marker of the migration.
 */
function extractStatement(marker, from) {
  const markerIndex = MIGRATION.indexOf(marker);

  assert.notEqual(markerIndex, -1, `the migration does not contain "${marker}"`);

  const start = MIGRATION.indexOf(from, markerIndex);
  const end = MIGRATION.indexOf(";", markerIndex);

  assert.notEqual(start, -1, `the migration does not contain "${from}" for "${marker}"`);
  assert.notEqual(end, -1, `the statement of "${marker}" is not closed`);

  return MIGRATION.slice(start, end + 1);
}

const GUARD_MARKER = "-- Guard: the conversion of the status column runs only";
const CANONICAL_MARKER = "-- Canonical spelling. A status that only differs";
const ADD_COLUMNS_MARKER = "-- The existing attendance rows are preserved.";
const BACKFILL_MARKER = "-- Metadata of the historical rows.";

const GUARD_BLOCK = extractDoBlock(GUARD_MARKER);
const CANONICAL_UPDATE = extractStatement(CANONICAL_MARKER, 'UPDATE "Attendance"');
const ADD_COLUMNS = extractStatement(ADD_COLUMNS_MARKER, 'ALTER TABLE "Attendance"');
const BACKFILL_BLOCK = extractDoBlock(BACKFILL_MARKER);

// --- The migration as a file -------------------------------------------------

test("the migration never rewrites a historical status to ABSENT", () => {
  assert.equal(
    MIGRATION.includes('SET "status" = \'ABSENT\''),
    false,
    "the migration must not convert an unsupported status into an absence"
  );
});

test("the migration refuses an unsupported historical status", () => {
  assert.match(GUARD_BLOCK, /RAISE EXCEPTION/);
  assert.match(GUARD_BLOCK, /unsupported_values/);
  // The exception names the values that caused the abort.
  assert.match(GUARD_BLOCK, /array_to_string\(unsupported_values/);
});

test("the guard of the migration runs before the column is converted", () => {
  const guardIndex = MIGRATION.indexOf(GUARD_MARKER);
  const conversionIndex = MIGRATION.indexOf(
    'ALTER COLUMN "status" TYPE "AttendanceStatus"'
  );

  assert.notEqual(conversionIndex, -1);
  assert.ok(
    guardIndex < conversionIndex,
    "the unsupported values have to be found before the column is converted"
  );
});

test("the comments of the migration describe what it really does", () => {
  assert.match(
    MIGRATION,
    /aborts the migration and reports the unexpected/,
    "the header has to say that an unsupported value stops the migration"
  );
  assert.match(
    MIGRATION,
    /No historical row is ever rewritten to ABSENT and no row is dropped\./,
    "the header has to say that no row is rewritten to an absence"
  );
});

test("the metadata of the historical rows is documented", () => {
  assert.match(MIGRATION, /markedAt.*createdAt/s);
  assert.match(MIGRATION, /LEGACY/);
  assert.match(
    MIGRATION,
    /The original method cannot be reconstructed/,
    "the migration has to say that the original method is unknown"
  );
});

// --- The migration against a real PostgreSQL ---------------------------------

class RollbackSignal extends Error {}

let schemaCounter = 0;

/**
 * Runs the work against a table of the migration in a schema of its own.
 *
 * The schema and the table are created inside the transaction and the
 * transaction is rolled back at the end, so the database keeps the state it
 * had before the test.
 */
async function withMigrationTable(prisma, { rows = [], work }) {
  schemaCounter += 1;
  const schema = `ncc_migration_test_${Date.now()}_${schemaCounter}`;
  let result;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(
        `CREATE TABLE "${schema}"."Attendance" (
           "id" TEXT NOT NULL,
           "status" TEXT NOT NULL DEFAULT 'ABSENT',
           "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           "updatedAt" TIMESTAMP(3) NOT NULL,
           CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
         )`
      );

      for (const row of rows) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "${schema}"."Attendance" ("id", "status", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4)`,
          row.id,
          row.status,
          new Date(row.createdAt),
          new Date(row.createdAt)
        );
      }

      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);

      result = await work(tx);

      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error;
    }
  }

  return result;
}

test("an unsupported historical status stops the migration", async (t) => {
  const context = loadContext();

  if (context.skip) {
    t.skip(context.skip);
    return;
  }

  const prisma = await openDatabase(context);

  try {
    const schema = `ncc_migration_guard_${Date.now()}`;

    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
          await tx.$executeRawUnsafe(
            `CREATE TABLE "${schema}"."Attendance" (
               "id" TEXT NOT NULL,
               "status" TEXT NOT NULL,
               "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
               "updatedAt" TIMESTAMP(3) NOT NULL,
               CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
             )`
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "${schema}"."Attendance" ("id", "status", "updatedAt")
             VALUES ($1, $2, CURRENT_TIMESTAMP)`,
            "a1",
            "PRESENT"
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "${schema}"."Attendance" ("id", "status", "updatedAt")
             VALUES ($1, $2, CURRENT_TIMESTAMP)`,
            "a2",
            "Half way there"
          );

          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
          await tx.$executeRawUnsafe(GUARD_BLOCK);

          throw new RollbackSignal();
        }),
      (error) => {
        assert.match(error.message, /outside the controlled set/);
        // The exception names the value that has to be classified.
        assert.match(error.message, /Half way there/);
        return true;
      }
    );
  } finally {
    await prisma.$disconnect();
  }
});

test("the recognised historical statuses keep their value", async (t) => {
  const context = loadContext();

  if (context.skip) {
    t.skip(context.skip);
    return;
  }

  const prisma = await openDatabase(context);

  const rows = [
    { id: "r1", status: "PRESENT", createdAt: "2024-01-05T06:30:00.000Z" },
    { id: "r2", status: "ABSENT", createdAt: "2024-01-05T06:30:00.000Z" },
    { id: "r3", status: "ON_DUTY", createdAt: "2024-01-05T06:30:00.000Z" },
    { id: "r4", status: "LEAVE", createdAt: "2024-01-05T06:30:00.000Z" },
  ];

  try {
    const result = await withMigrationTable(prisma, {
      rows,
      work: async (tx) => {
        await tx.$executeRawUnsafe(GUARD_BLOCK);
        await tx.$executeRawUnsafe(CANONICAL_UPDATE);

        return tx.$queryRawUnsafe(
          `SELECT "id", "status" FROM "Attendance" ORDER BY "id"`
        );
      },
    });

    assert.equal(result.length, 4);

    for (const row of result) {
      assert.equal(
        row.status,
        rows.find((entry) => entry.id === row.id).status,
        "a recognised status must keep its value"
      );
    }
  } finally {
    await prisma.$disconnect();
  }
});

test("a status that only differs in its spelling keeps its meaning", async (t) => {
  const context = loadContext();

  if (context.skip) {
    t.skip(context.skip);
    return;
  }

  const prisma = await openDatabase(context);

  const rows = [
    { id: "r1", status: "present", createdAt: "2024-01-05T06:30:00.000Z" },
    { id: "r2", status: "On Duty", createdAt: "2024-01-05T06:30:00.000Z" },
  ];

  try {
    const result = await withMigrationTable(prisma, {
      rows,
      work: async (tx) => {
        await tx.$executeRawUnsafe(GUARD_BLOCK);
        await tx.$executeRawUnsafe(CANONICAL_UPDATE);

        return tx.$queryRawUnsafe(
          `SELECT "id", "status" FROM "Attendance" ORDER BY "id"`
        );
      },
    });

    assert.equal(result[0].status, "PRESENT");
    assert.equal(result[1].status, "ON_DUTY");
  } finally {
    await prisma.$disconnect();
  }
});

test("the historical metadata is backfilled from the creation time", async (t) => {
  const context = loadContext();

  if (context.skip) {
    t.skip(context.skip);
    return;
  }

  const prisma = await openDatabase(context);

  const rows = [
    { id: "r1", status: "PRESENT", createdAt: "2024-01-05T06:30:00.000Z" },
  ];

  try {
    const result = await withMigrationTable(prisma, {
      rows,
      work: async (tx) => {
        await tx.$executeRawUnsafe(ADD_COLUMNS);
        await tx.$executeRawUnsafe(BACKFILL_BLOCK);

        return tx.$queryRawUnsafe(
          `SELECT "id", "markedAt", "method", "createdAt" FROM "Attendance" ORDER BY "id"`
        );
      },
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].method, "LEGACY");
    assert.equal(
      new Date(result[0].markedAt).getTime(),
      new Date(result[0].createdAt).getTime(),
      "the marked time of a historical row is the creation time of the row"
    );
  } finally {
    await prisma.$disconnect();
  }
});

test("a row that was marked after the migration keeps its own metadata", async (t) => {
  const context = loadContext();

  if (context.skip) {
    t.skip(context.skip);
    return;
  }

  const prisma = await openDatabase(context);

  try {
    const result = await withMigrationTable(prisma, {
      rows: [],
      work: async (tx) => {
        await tx.$executeRawUnsafe(ADD_COLUMNS);

        // A row that was written after the columns were added has its own
        // marking time, so the backfill must not touch it. The marking time is
        // one hour after the creation time, so a backfill would be visible.
        await tx.$executeRawUnsafe(
          `INSERT INTO "Attendance" ("id", "status", "createdAt", "updatedAt", "markedAt", "method")
           VALUES ($1, $2, $3, $3, $4, $5)`,
          "new",
          "PRESENT",
          new Date("2025-06-01T09:00:00.000Z"),
          new Date("2025-06-01T10:00:00.000Z"),
          "MANUAL"
        );

        await tx.$executeRawUnsafe(BACKFILL_BLOCK);

        return tx.$queryRawUnsafe(
          `SELECT "id", "markedAt", "method", "createdAt" FROM "Attendance" ORDER BY "id"`
        );
      },
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].method, "MANUAL");
    assert.equal(
      new Date(result[0].markedAt).getTime() -
        new Date(result[0].createdAt).getTime(),
      60 * 60 * 1000,
      "the backfill must not touch a row that was marked after the migration"
    );
  } finally {
    await prisma.$disconnect();
  }
});
