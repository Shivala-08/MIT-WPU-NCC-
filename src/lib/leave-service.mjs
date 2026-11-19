import {
  LEAVE_STATUSES,
  MAX_REASON_LENGTH,
  MIN_REJECTION_REASON_LENGTH,
  parseDateOnly,
  validateLeaveInput,
} from "./attendance-rules.mjs";
import { runInTransaction, serviceError, writeAudit } from "./attendance-service.mjs";

export async function submitLeave(db, { actor, input }) {
  if (!actor?.id) {
    throw serviceError("Unauthorized", 401);
  }

  if (actor.role !== "CADET") {
    throw serviceError("Only a cadet can request leave", 403);
  }

  const validation = validateLeaveInput(input);

  if (!validation.ok) {
    throw serviceError(validation.errors[0]?.message ?? "Invalid request", 400, {
      errors: validation.errors,
    });
  }

  const overlapping = await db.leaveRequest.findFirst({
    where: {
      userId: actor.id,
      status: "PENDING",
      startDate: { lte: validation.values.endDate },
      endDate: { gte: validation.values.startDate },
    },
  });

  if (overlapping) {
    throw serviceError(
      "A leave request for these dates is already pending",
      409
    );
  }

  return runInTransaction(db, async (tx) => {
    const request = await tx.leaveRequest.create({
      data: {
        userId: actor.id,
        type: validation.values.type,
        reason: validation.values.reason,
        startDate: validation.values.startDate,
        endDate: validation.values.endDate,
        status: "PENDING",
      },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "LEAVE_SUBMITTED",
      entity: "LeaveRequest",
      entityId: request.id,
      oldData: null,
      newData: {
        type: request.type,
        startDate: request.startDate,
        endDate: request.endDate,
        status: request.status,
      },
    });

    return request;
  });
}

export async function listOwnLeaves(db, { userId }) {
  return db.leaveRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function readLeave(db, { id }) {
  return db.leaveRequest.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          cadetProfile: {
            select: {
              fullName: true,
              prn: true,
              regiNumber: true,
              wing: true,
              division: true,
              year: true,
              branch: true,
            },
          },
        },
      },
      reviewedBy: { select: { id: true, name: true } },
    },
  });
}

export async function cancelLeave(db, { actor, id }) {
  const request = await db.leaveRequest.findUnique({ where: { id } });

  if (!request) {
    throw serviceError("Leave request not found", 404);
  }

  if (request.userId !== actor?.id) {
    throw serviceError("This leave request belongs to another cadet", 403);
  }

  if (request.status !== "PENDING") {
    throw serviceError(
      `A ${request.status.toLowerCase()} request cannot be cancelled`,
      409
    );
  }

  return runInTransaction(db, async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "LEAVE_CANCELLED",
      entity: "LeaveRequest",
      entityId: updated.id,
      oldData: { status: request.status },
      newData: { status: updated.status },
    });

    return updated;
  });
}

export async function listLeaves(db, { status, take = 50, skip = 0 } = {}) {
  const where = {};

  if (status) {
    where.status = status;
  }

  return db.leaveRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    skip,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          cadetProfile: {
            select: {
              fullName: true,
              prn: true,
              regiNumber: true,
              wing: true,
              division: true,
              year: true,
              branch: true,
            },
          },
        },
      },
      reviewedBy: { select: { id: true, name: true } },
    },
  });
}

export async function reviewLeave(db, { actor, id, decision, reason }) {
  if (actor?.role !== "ADMIN") {
    throw serviceError("Only an administrator can decide a leave request", 403);
  }

  if (!["APPROVED", "REJECTED"].includes(decision)) {
    throw serviceError("The decision has to be an approval or a rejection", 400);
  }

  const request = await db.leaveRequest.findUnique({ where: { id } });

  if (!request) {
    throw serviceError("Leave request not found", 404);
  }

  if (request.userId === actor.id) {
    throw serviceError("A cadet cannot decide their own leave request", 403);
  }

  if (request.status !== "PENDING") {
    throw serviceError(
      `A ${request.status.toLowerCase()} request cannot be decided again`,
      409
    );
  }

  const cleanReason = typeof reason === "string" ? reason.trim() : "";

  if (decision === "REJECTED" && cleanReason.length < MIN_REJECTION_REASON_LENGTH) {
    throw serviceError(
      `A rejection needs a reason of at least ${MIN_REJECTION_REASON_LENGTH} characters`,
      400
    );
  }

  if (cleanReason.length > MAX_REASON_LENGTH) {
    throw serviceError(
      `The reason can be at most ${MAX_REASON_LENGTH} characters long`,
      400
    );
  }

  return runInTransaction(db, async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: decision,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewReason: cleanReason.length > 0 ? cleanReason : null,
      },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: decision === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      entity: "LeaveRequest",
      entityId: updated.id,
      oldData: { status: request.status },
      newData: {
        status: updated.status,
        reason: updated.reviewReason ?? null,
      },
    });

    return updated;
  });
}

export function serializeLeave(request) {
  if (!request) {
    return null;
  }

  return {
    id: request.id,
    userId: request.userId,
    type: request.type,
    reason: request.reason,
    startDate:
      request.startDate instanceof Date
        ? request.startDate.toISOString()
        : request.startDate,
    endDate:
      request.endDate instanceof Date
        ? request.endDate.toISOString()
        : request.endDate,
    status: request.status,
    reviewedById: request.reviewedById ?? null,
    reviewedAt: request.reviewedAt
      ? new Date(request.reviewedAt).toISOString()
      : null,
    reviewReason: request.reviewReason ?? null,
    createdAt:
      request.createdAt instanceof Date
        ? request.createdAt.toISOString()
        : request.createdAt,
    cadet: request.user
      ? {
          id: request.user.id,
          name: request.user.name,
          email: request.user.email,
          fullName: request.user.cadetProfile?.fullName ?? request.user.name,
          prn: request.user.cadetProfile?.prn ?? null,
          regiNumber: request.user.cadetProfile?.regiNumber ?? null,
          wing: request.user.cadetProfile?.wing ?? null,
          division: request.user.cadetProfile?.division ?? null,
          year: request.user.cadetProfile?.year ?? null,
          branch: request.user.cadetProfile?.branch ?? null,
        }
      : null,
    reviewer: request.reviewedBy
      ? { id: request.reviewedBy.id, name: request.reviewedBy.name }
      : null,
  };
}

export { LEAVE_STATUSES, parseDateOnly };
