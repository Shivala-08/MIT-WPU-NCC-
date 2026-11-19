/*
  Phase 3.5.3: account deactivation.

  An operational cadet account is no longer deleted. The account row stays in
  the database together with its attendance rows, its leave requests, its
  profile and its audit history, so the historical record of the unit stays
  complete and every record keeps its original owner.

  The three new columns on "User" describe the deactivation:

    deactivatedAt       the moment of the deactivation
    deactivatedById     the administrator who performed it
    deactivationReason  the written reason of the administrator

  A deactivated account keeps its approval state. The approval lifecycle is
  not changed by a deactivation, the deactivation is a separate fact that the
  server checks on every request.

  The foreign key of "CadetProfile" changes from CASCADE to RESTRICT. The
  profile is part of the historical record of the cadet, so a hard delete of
  an account must not remove it. The application has no hard delete path for
  an account any more; this constraint makes sure that a future one cannot
  destroy the history silently.
*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT,
ADD COLUMN     "deactivationReason" TEXT;

-- CreateIndex
CREATE INDEX "User_deactivatedAt_idx" ON "User"("deactivatedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "CadetProfile" DROP CONSTRAINT "CadetProfile_userId_fkey";

-- AddForeignKey
ALTER TABLE "CadetProfile" ADD CONSTRAINT "CadetProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
