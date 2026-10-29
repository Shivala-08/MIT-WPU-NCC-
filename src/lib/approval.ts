import type { ApprovalStatus as PrismaApprovalStatus } from "@prisma/client";
import { isApprovalStatus as isApprovalStatusValue } from "./eligibility.mjs";

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export type ApprovalStatus = PrismaApprovalStatus;

/**
 * Type safe wrapper around the runtime check in the eligibility module.
 */
export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return isApprovalStatusValue(value) as boolean;
}

export function toApprovalStatus(value: unknown): ApprovalStatus | null {
  return isApprovalStatus(value) ? value : null;
}
