-- Account eligibility, approval state and the NCC roster.
--
-- `User.approvalStatus` is the single authoritative eligibility state.
-- `CadetProfile.status` becomes a derived mirror of it, enforced by triggers,
-- so the two columns can never disagree and there is only one source of truth.
--
-- The migration is additive and data preserving:
--   * existing staff accounts (ADMIN / OFFICER) are backfilled as APPROVED;
--   * existing cadets take their state from `CadetProfile.status`
--     (APPROVED / REJECTED), every other legacy value becomes PENDING;
--   * no existing row is deleted and no password hash is touched.

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Roster" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "prn" TEXT,
    "regiNumber" TEXT,
    "wing" TEXT,
    "division" TEXT,
    "year" TEXT,
    "branch" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roster_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "approvalStatus" "ApprovalStatus";
ALTER TABLE "User" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "User" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "rosterId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Roster_email_key" ON "Roster"("email");
CREATE UNIQUE INDEX "User_rosterId_key" ON "User"("rosterId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill the authoritative state from the legacy profile status.
UPDATE "User" AS u
SET "approvalStatus" = CASE
    WHEN u."role" IN ('ADMIN', 'OFFICER') THEN 'APPROVED'::"ApprovalStatus"
    WHEN EXISTS (
        SELECT 1 FROM "CadetProfile" p
        WHERE p."userId" = u."id" AND p."status" = 'REJECTED'
    ) THEN 'REJECTED'::"ApprovalStatus"
    WHEN EXISTS (
        SELECT 1 FROM "CadetProfile" p
        WHERE p."userId" = u."id" AND p."status" = 'APPROVED'
    ) THEN 'APPROVED'::"ApprovalStatus"
    ELSE 'PENDING'::"ApprovalStatus"
END;

ALTER TABLE "User" ALTER COLUMN "approvalStatus" SET DEFAULT 'PENDING';
ALTER TABLE "User" ALTER COLUMN "approvalStatus" SET NOT NULL;

-- Align the legacy mirror with the authoritative state.
UPDATE "CadetProfile" AS p
SET "status" = u."approvalStatus"::text
FROM "User" AS u
WHERE u."id" = p."userId";

-- Keep the mirror in sync when the authoritative state changes.
CREATE OR REPLACE FUNCTION ncc_sync_cadet_profile_status() RETURNS trigger AS $$
BEGIN
    IF NEW."approvalStatus" IS DISTINCT FROM OLD."approvalStatus" THEN
        UPDATE "CadetProfile"
        SET "status" = NEW."approvalStatus"::text
        WHERE "userId" = NEW."id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_user_approval_status_sync"
AFTER UPDATE OF "approvalStatus" ON "User"
FOR EACH ROW EXECUTE FUNCTION ncc_sync_cadet_profile_status();

-- The mirror is derived: it can never be written to a value that disagrees
-- with the authoritative state.
CREATE OR REPLACE FUNCTION ncc_force_cadet_profile_status() RETURNS trigger AS $$
BEGIN
    SELECT u."approvalStatus"::text INTO NEW."status"
    FROM "User" AS u
    WHERE u."id" = NEW."userId";
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_cadet_profile_status_insert"
BEFORE INSERT ON "CadetProfile"
FOR EACH ROW EXECUTE FUNCTION ncc_force_cadet_profile_status();

CREATE TRIGGER "trg_cadet_profile_status_update"
BEFORE UPDATE OF "status" ON "CadetProfile"
FOR EACH ROW EXECUTE FUNCTION ncc_force_cadet_profile_status();
