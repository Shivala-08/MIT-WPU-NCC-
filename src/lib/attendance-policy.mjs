import { runInTransaction, serviceError, writeAudit } from "./attendance-service.mjs";
import { DEFAULT_POLICY } from "./attendance-calculator.mjs";
import { normalizeActivityType } from "./attendance-rules.mjs";

export async function readPolicy(db) {
  const policy = await db.attendancePolicy.findUnique({
    where: { id: "default" },
  });

  if (!policy) {
    return { ...DEFAULT_POLICY };
  }

  return {
    ...DEFAULT_POLICY,
    ...policy,
    activityTypes: Array.isArray(policy.activityTypes) ? policy.activityTypes : [],
  };
}

export async function updatePolicy(db, { actor, values }) {
  if (actor?.role !== "ADMIN") {
    throw serviceError(
      "Only an administrator can change the attendance policy",
      403
    );
  }

  const current = await readPolicy(db);

  const thresholdPercent =
    values?.thresholdPercent === undefined
      ? current.thresholdPercent
      : Number(values.thresholdPercent);

  if (!Number.isInteger(thresholdPercent) || thresholdPercent < 0 || thresholdPercent > 100) {
    throw serviceError(
      "The threshold has to be a whole number between 0 and 100",
      400
    );
  }

  // The activity types are stored in their canonical form. A value that is
  // outside the controlled vocabulary is kept as it was written, because an
  // administrator that names such a value has made an explicit decision.
  const activityTypes = Array.isArray(values?.activityTypes)
    ? values.activityTypes
        .map(
          (type) =>
            normalizeActivityType(type) ?? String(type).trim().toUpperCase()
        )
        .filter((type) => type.length > 0)
    : current.activityTypes;

  const next = {
    thresholdPercent,
    thresholdConfirmed:
      values?.thresholdConfirmed === undefined
        ? current.thresholdConfirmed
        : Boolean(values.thresholdConfirmed),
    lateCountsAsPresent:
      values?.lateCountsAsPresent === undefined
        ? current.lateCountsAsPresent
        : Boolean(values.lateCountsAsPresent),
    excusedExcludedFromDenominator:
      values?.excusedExcludedFromDenominator === undefined
        ? current.excusedExcludedFromDenominator
        : Boolean(values.excusedExcludedFromDenominator),
    activityTypes,
    notes:
      values?.notes === undefined
        ? current.notes
        : values.notes === null
          ? null
          : String(values.notes).trim().slice(0, 500) || null,
  };

  return runInTransaction(db, async (tx) => {
    const policy = await tx.attendancePolicy.upsert({
      where: { id: "default" },
      update: {
        ...next,
        version: current.version + 1,
        updatedById: actor.id,
      },
      create: {
        id: "default",
        ...next,
        version: 1,
        updatedById: actor.id,
      },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "ATTENDANCE_POLICY_CHANGED",
      entity: "AttendancePolicy",
      entityId: policy.id,
      oldData: {
        thresholdPercent: current.thresholdPercent,
        thresholdConfirmed: current.thresholdConfirmed,
        lateCountsAsPresent: current.lateCountsAsPresent,
        excusedExcludedFromDenominator: current.excusedExcludedFromDenominator,
        activityTypes: current.activityTypes,
        version: current.version,
      },
      newData: {
        thresholdPercent: policy.thresholdPercent,
        thresholdConfirmed: policy.thresholdConfirmed,
        lateCountsAsPresent: policy.lateCountsAsPresent,
        excusedExcludedFromDenominator: policy.excusedExcludedFromDenominator,
        activityTypes: policy.activityTypes,
        version: policy.version,
      },
    });

    return policy;
  });
}
