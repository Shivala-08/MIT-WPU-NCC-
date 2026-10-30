-- Cadet profile completion support.
--
-- A cadet who signs in without a pre-registration has no profile at all, and
-- a roster row may not carry a wing, a year or a branch. The profile columns
-- that describe information the cadet still has to provide were therefore
-- nullable, so an incomplete profile can be stored and completed later.
--
-- The migration is additive and data preserving:
--   * no row is deleted and no value is changed;
--   * a column that is widened to nullable keeps every stored value;
--   * the new thumbnail column starts out empty for every row;
--   * the approval triggers are untouched, so `CadetProfile.status` keeps
--     mirroring `User.approvalStatus` exactly as before.

-- AlterTable
ALTER TABLE "CadetProfile" ALTER COLUMN "wing" DROP NOT NULL;
ALTER TABLE "CadetProfile" ALTER COLUMN "year" DROP NOT NULL;
ALTER TABLE "CadetProfile" ALTER COLUMN "branch" DROP NOT NULL;
ALTER TABLE "CadetProfile" ALTER COLUMN "dob" DROP NOT NULL;
ALTER TABLE "CadetProfile" ALTER COLUMN "bloodGroup" DROP NOT NULL;
ALTER TABLE "CadetProfile" ALTER COLUMN "gender" DROP NOT NULL;
ALTER TABLE "CadetProfile" ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CadetProfile" ADD COLUMN IF NOT EXISTS "photoThumbnailUrl" TEXT;
