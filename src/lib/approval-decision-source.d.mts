export type ApprovalDecisionSource = "NONE" | "AUTOMATIC" | "ADMINISTRATOR";

/**
 * Reports whether the connected database has the column
 * `User.approvalDecisionSource`.
 *
 * The check is read only and it is cached per database client.
 */
export function decisionSourceColumnAvailable(db: unknown): Promise<boolean>;

/**
 * Builds the part of an update that records the origin of the decision.
 *
 * The column is only written when the database has it.
 */
export function decisionSourceData(
  source: ApprovalDecisionSource,
  columnAvailable: boolean
): Partial<Record<"approvalDecisionSource", ApprovalDecisionSource>>;
