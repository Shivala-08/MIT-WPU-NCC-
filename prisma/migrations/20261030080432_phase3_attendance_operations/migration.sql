/*
  Phase 3: attendance sessions, manual attendance, QR check-in, leave requests
  and the configurable attendance policy.

  The migration is additive. The only change to an existing column is the
  `Attendance.status` conversion from free text to a controlled enum.

  Historical status values
  ------------------------
  The attendance API of the earlier phases wrote the status of a mark without
  any validation, so the stored text is not limited to the controlled set. The
  migration therefore never guesses a value:

    * a status that matches one of the six controlled values, ignoring the case
      and the spacing of its words, keeps its meaning and is written in the
      canonical spelling;
    * every other status aborts the migration and reports the unexpected
      values, so that an administrator classifies them first.

  No historical row is ever rewritten to ABSENT and no row is dropped. The
  recognised values of the old application were PRESENT, ABSENT, ON_DUTY and
  LEAVE; LATE and EXCUSED were added by phase 3. All six are members of the
  new enum, so no historical value needs an explicit mapping.
*/
-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'ON_DUTY', 'LEAVE', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('MEDICAL', 'PERSONAL', 'ACADEMIC', 'OTHER');

-- Guard: the conversion of the status column runs only when every historical
-- value can be classified. The check runs before any other change of this
-- migration, so an unexpected value leaves the database untouched.
DO $$
DECLARE
    unsupported_values TEXT[];
BEGIN
    SELECT array_agg(DISTINCT "status" ORDER BY "status")
      INTO unsupported_values
      FROM "Attendance"
     WHERE upper(regexp_replace(btrim("status"), '\s+', '_', 'g'))
       NOT IN ('PRESENT', 'ABSENT', 'ON_DUTY', 'LEAVE', 'LATE', 'EXCUSED');

    IF unsupported_values IS NOT NULL THEN
        RAISE EXCEPTION
            'The Attendance table contains % status value(s) outside the controlled set: %. The migration was stopped and no row was changed. Classify these values before migrating.',
            array_length(unsupported_values, 1),
            array_to_string(unsupported_values, ', ');
    END IF;
END
$$;

-- Canonical spelling. A status that only differs from a controlled value in
-- its case or in the spacing of its words keeps its meaning, so it is
-- normalised and not reclassified. Every other value was rejected above.
UPDATE "Attendance"
   SET "status" = upper(regexp_replace(btrim("status"), '\s+', '_', 'g'))
 WHERE "status" <> upper(regexp_replace(btrim("status"), '\s+', '_', 'g'));

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_userId_fkey";

-- The existing attendance rows are preserved. The free text status column
-- becomes a controlled enum with the same value set, so no historical row is
-- remapped and no data is dropped.
-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "markedById" TEXT,
ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "note" TEXT;

-- Metadata of the historical rows.
--
-- "markedAt" and "method" did not exist before this migration. Every row that
-- already existed received the default of both columns. The default of
-- "markedAt" is the start of the migration transaction, so it is the exact
-- value that identifies the historical rows.
--
-- The original marking time cannot be reconstructed from the old data, but the
-- creation time of the row is the reliable source that the old table kept, so
-- it is copied over instead of leaving the migration time on every row.
--
-- The original method cannot be reconstructed at all: the old API never stored
-- it. The historical rows are therefore marked as LEGACY. Claiming that an
-- administrator marked them by hand would be a false statement in the reports.
DO $$
DECLARE
    migration_timestamp TIMESTAMP(3) := CURRENT_TIMESTAMP::timestamp(3);
BEGIN
    UPDATE "Attendance"
       SET "method" = 'LEGACY'
     WHERE "method" = 'MANUAL'
       AND "markedAt" = migration_timestamp;

    UPDATE "Attendance"
       SET "markedAt" = "createdAt"
     WHERE "markedAt" = migration_timestamp;
END
$$;

-- AlterTable
ALTER TABLE "Attendance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Attendance" ALTER COLUMN "status" TYPE "AttendanceStatus" USING ("status"::"AttendanceStatus");
ALTER TABLE "Attendance" ALTER COLUMN "status" SET DEFAULT 'ABSENT';

-- AlterTable
ALTER TABLE "AttendanceSession" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "venue" TEXT;

-- CreateTable
CREATE TABLE "AttendanceQrToken" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceQrToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "reason" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendancePolicy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "version" INTEGER NOT NULL DEFAULT 1,
    "thresholdPercent" INTEGER NOT NULL DEFAULT 75,
    "thresholdConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "lateCountsAsPresent" BOOLEAN NOT NULL DEFAULT false,
    "excusedExcludedFromDenominator" BOOLEAN NOT NULL DEFAULT true,
    "activityTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceQrToken_tokenHash_key" ON "AttendanceQrToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AttendanceQrToken_sessionId_idx" ON "AttendanceQrToken"("sessionId");

-- CreateIndex
CREATE INDEX "AttendanceQrToken_expiresAt_idx" ON "AttendanceQrToken"("expiresAt");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_status_idx" ON "LeaveRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Attendance_sessionId_idx" ON "Attendance"("sessionId");

-- CreateIndex
CREATE INDEX "Attendance_status_idx" ON "Attendance"("status");

-- CreateIndex
CREATE INDEX "AttendanceSession_startsAt_idx" ON "AttendanceSession"("startsAt");

-- CreateIndex
CREATE INDEX "AttendanceSession_status_idx" ON "AttendanceSession"("status");

-- CreateIndex
CREATE INDEX "AttendanceSession_date_idx" ON "AttendanceSession"("date");

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceQrToken" ADD CONSTRAINT "AttendanceQrToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
