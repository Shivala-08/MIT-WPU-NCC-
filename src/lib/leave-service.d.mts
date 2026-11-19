export interface LeaveCadet {
  id: string;
  name: string;
  email: string;
  fullName: string;
  prn: string | null;
  regiNumber: string | null;
  wing: string | null;
  division: string | null;
  year: string | null;
  branch: string | null;
}

export interface SerializedLeave {
  id: string;
  userId: string;
  type: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  createdAt: string;
  cadet: LeaveCadet | null;
  reviewer: { id: string; name: string } | null;
}

export function submitLeave(
  db: unknown,
  input: {
    actor: { id: string; role: string; approvalStatus?: string };
    input: unknown;
  }
): Promise<LeaveRequestRecord>;
export function listOwnLeaves(
  db: unknown,
  input: { userId: string }
): Promise<LeaveRequestRecord[]>;
export interface LeaveRequestRecord {
  id: string;
  userId: string;
  type: string;
  reason: string;
  startDate: Date;
  endDate: Date;
  status: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    name: string;
    email: string;
    cadetProfile: {
      fullName: string;
      prn: string | null;
      regiNumber: string | null;
      wing: string | null;
      division: string | null;
      year: string | null;
      branch: string | null;
    } | null;
  } | null;
  reviewedBy?: { id: string; name: string } | null;
}

export function readLeave(
  db: unknown,
  input: { id: string }
): Promise<LeaveRequestRecord | null>;
export function cancelLeave(
  db: unknown,
  input: { actor: { id: string; role: string }; id: string }
): Promise<LeaveRequestRecord>;
export function listLeaves(
  db: unknown,
  filters?: { status?: string; take?: number; skip?: number }
): Promise<LeaveRequestRecord[]>;
export function reviewLeave(
  db: unknown,
  input: {
    actor: { id: string; role: string };
    id: string;
    decision: string;
    reason?: string;
  }
): Promise<LeaveRequestRecord>;
export function serializeLeave(request: unknown): SerializedLeave | null;
