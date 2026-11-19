-- The origin of an approval decision.
--
-- `User.approvalStatus` says what the state of an account is. This migration
-- adds the column that says who decided it:
--
--   NONE         - no decision was made yet, the account is still waiting;
--   AUTOMATIC    - the roster matched the account and the application
--                  approved it during a Google sign in;
--   ADMINISTRATOR - an administrator of the unit decided.
--
-- The decision of an administrator is authoritative. A cadet that an
-- administrator put back into PENDING is never approved automatically by a
-- later sign in, because the source of the decision is read from this column
-- and not from `approvedById` alone.
--
-- The migration is additive and data preserving:
--   * no existing row is deleted and no existing column is changed;
--   * every account that an administrator decided keeps that decision;
--   * every account that the roster approved automatically keeps it;
--   * every other account keeps the source NONE.
--
-- The file is created but not applied. Applying it is a separate, explicitly
-- authorised step.

-- CreateEnum
CREATE TYPE "ApprovalDecisionSource" AS ENUM ('NONE', 'AUTOMATIC', 'ADMINISTRATOR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "approvalDecisionSource" "ApprovalDecisionSource" NOT NULL DEFAULT 'NONE';

-- An account that carries an administrator id was decided by an administrator.
-- The decision of an administrator is authoritative from now on.
UPDATE "User"
SET "approvalDecisionSource" = 'ADMINISTRATOR'::"ApprovalDecisionSource"
WHERE "approvedById" IS NOT NULL;

-- An account that is approved, that was never decided by an administrator and
-- that is linked to a roster row was approved automatically by the roster.
UPDATE "User"
SET "approvalDecisionSource" = 'AUTOMATIC'::"ApprovalDecisionSource"
WHERE "approvalStatus" = 'APPROVED'
  AND "approvedById" IS NULL
  AND "rosterId" IS NOT NULL;
