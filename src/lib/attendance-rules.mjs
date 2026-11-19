export const SESSION_STATUSES = ["DRAFT", "OPEN", "CLOSED", "CANCELLED"];

export const ATTENDANCE_STATUSES = [
  "PRESENT",
  "ABSENT",
  "ON_DUTY",
  "LEAVE",
  "LATE",
  "EXCUSED",
];

export const ATTENDANCE_METHODS = ["MANUAL", "QR", "MANUAL_CODE", "LEGACY"];

export const ACTIVITY_TYPES = [
  "PARADE",
  "PHYSICAL_TRAINING",
  "DRILL",
  "TRAINING",
  "CAMP",
  "EVENT",
  "OTHER",
];

export const LEAVE_TYPES = ["MEDICAL", "PERSONAL", "ACADEMIC", "OTHER"];

export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

export const SESSION_ACTIONS = ["open", "close", "cancel"];

export const MAX_MARKS_PER_REQUEST = 500;

export const MAX_VENUE_LENGTH = 120;

export const MAX_TITLE_LENGTH = 120;

export const MAX_REASON_LENGTH = 500;

// A correction of a closed session and a rejection of a leave request always
// carry a written reason.
export const MIN_REASON_LENGTH = 5;

export const MIN_CORRECTION_REASON_LENGTH = MIN_REASON_LENGTH;

export const MIN_REJECTION_REASON_LENGTH = MIN_REASON_LENGTH;

export const MAX_VENUE_ERROR = `The venue can be at most ${MAX_VENUE_LENGTH} characters long`;

export const SESSION_TIME_ZONE_OFFSET = "+05:30";

/**
 * The activity types of the controlled vocabulary and the spellings that are
 * known to mean the same thing.
 *
 * The activity type of a session was free text before phase 3. The old admin
 * screen offered "Parade", "Weapon Firing", "Camp", "Social Service" and
 * "Lecture", while the controlled vocabulary of phase 3 uses the uppercase
 * names below. A spelling that is listed here keeps its meaning and is
 * counted as the canonical type.
 *
 * A spelling that is not listed here is not guessed. It stays outside the
 * controlled vocabulary, it is never counted as another type and it is
 * reported, so that the unit can classify it.
 */
const ALIASES = {
  PARADE: "PARADE",
  "MORNING PARADE": "PARADE",
  "PHYSICAL TRAINING": "PHYSICAL_TRAINING",
  PHYSICAL_TRAINING: "PHYSICAL_TRAINING",
  PT: "PHYSICAL_TRAINING",
  DRILL: "DRILL",
  "DRILL PRACTICE": "DRILL",
  TRAINING: "TRAINING",
  "TRAINING SESSION": "TRAINING",
  // A weapon training is a training activity. It is not a physical training
  // and it is not a drill practice.
  "WEAPON TRAINING": "TRAINING",
  CAMP: "CAMP",
  "NCC CAMP": "CAMP",
  EVENT: "EVENT",
  "SPECIAL ACTIVITY": "EVENT",
  "INSTITUTIONAL EVENT": "EVENT",
  OTHER: "OTHER",
};

/**
 * The legacy spellings that are outside the controlled vocabulary.
 *
 * They were offered by the old admin screen and they are kept here so that
 * the documentation can name them. They are deliberately not mapped, because
 * the old screen does not say which canonical type they belong to.
 */
export const UNMAPPED_LEGACY_ACTIVITY_TYPES = Object.freeze([
  "Weapon Firing",
  "Social Service",
  "Lecture",
]);

/**
 * The canonical form of one activity type.
 *
 * @param {unknown} value
 * @returns {string | null} the canonical type, or null when the value is
 * outside the controlled vocabulary.
 */
export function normalizeActivityType(value) {
  if (typeof value !== "string") {
    return null;
  }

  const key = value.trim().toUpperCase().replace(/\s+/g, " ");

  return ALIASES[key] ?? null;
}

/**
 * The stored spellings that belong to one canonical activity type.
 *
 * A filter on a canonical type has to match the legacy spellings as well,
 * otherwise the sessions of the earlier phases disappear from the report.
 *
 * @param {string} canonicalType
 * @returns {string[]}
 */
export function activityTypeSpellings(canonicalType) {
  const canonical = String(canonicalType ?? "").trim().toUpperCase();

  if (!canonical) {
    return [];
  }

  const spellings = new Set([canonical]);

  for (const [spelling, target] of Object.entries(ALIASES)) {
    if (target === canonical) {
      spellings.add(spelling);
    }
  }

  return [...spellings];
}

/**
 * Splits the activity types of a policy into the canonical types and the
 * spellings that the policy names itself.
 *
 * A policy entry that is outside the controlled vocabulary is kept as it was
 * written. An administrator that names such a spelling in the policy has
 * made an explicit decision, and the application follows it without guessing
 * what the spelling means.
 *
 * @param {unknown} values
 * @returns {{ canonical: Set<string>, explicit: Set<string> }}
 */
export function resolvePolicyActivityTypes(values) {
  const canonical = new Set();
  const explicit = new Set();

  if (!Array.isArray(values)) {
    return { canonical, explicit };
  }

  for (const value of values) {
    const normalized = normalizeActivityType(value);

    if (normalized) {
      canonical.add(normalized);
      continue;
    }

    const fallback = String(value ?? "").trim().toUpperCase();

    if (fallback.length > 0) {
      explicit.add(fallback);
    }
  }

  return { canonical, explicit };
}

export function normalizeAttendanceStatus(value) {
  if (typeof value !== "string") {
    return null;
  }

  const key = value.trim().toUpperCase().replace(/\s+/g, "_");

  return ATTENDANCE_STATUSES.includes(key) ? key : null;
}

export function normalizeLeaveType(value) {
  if (typeof value !== "string") {
    return null;
  }

  const key = value.trim().toUpperCase().replace(/\s+/g, "_");

  return LEAVE_TYPES.includes(key) ? key : null;
}

export function isValidTimeString(value) {
  if (typeof value !== "string") {
    return false;
  }

  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(":").map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function buildSessionWindow(date, startTime, endTime) {
  if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) {
    return { startsAt: null, endsAt: null };
  }

  const startsAt = new Date(
    `${date}T${startTime}:00${SESSION_TIME_ZONE_OFFSET}`
  );
  const endsAt = new Date(`${date}T${endTime}:00${SESSION_TIME_ZONE_OFFSET}`);

  return { startsAt, endsAt };
}

export function buildFallbackWindow(date) {
  const startsAt = new Date(`${date}T00:00:00${SESSION_TIME_ZONE_OFFSET}`);
  const endsAt = new Date(`${date}T23:59:59${SESSION_TIME_ZONE_OFFSET}`);

  return { startsAt, endsAt };
}

export function validateSessionInput(input) {
  const errors = [];
  const values = {};

  const title = typeof input?.title === "string" ? input.title.trim() : "";

  if (title.length < 3) {
    errors.push({ field: "title", message: "The title needs at least 3 characters" });
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.push({
      field: "title",
      message: `The title can be at most ${MAX_TITLE_LENGTH} characters long`,
    });
  } else {
    values.title = title;
  }

  const activityType = normalizeActivityType(
    input?.activityType ?? input?.type
  );

  if (!activityType) {
    errors.push({
      field: "activityType",
      message: `The activity type has to be one of: ${ACTIVITY_TYPES.join(", ")}`,
    });
  } else {
    values.activityType = activityType;
  }

  const date =
    typeof input?.date === "string" ? input.date.trim().slice(0, 10) : "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    errors.push({ field: "date", message: "The session date is not valid" });
  } else {
    values.date = date;
  }

  const startTime =
    typeof input?.startTime === "string" ? input.startTime.trim() : "";
  const endTime = typeof input?.endTime === "string" ? input.endTime.trim() : "";

  if (startTime.length > 0 && !isValidTimeString(startTime)) {
    errors.push({ field: "startTime", message: "The start time must be HH:MM" });
  }

  if (endTime.length > 0 && !isValidTimeString(endTime)) {
    errors.push({ field: "endTime", message: "The end time must be HH:MM" });
  }

  if (
    isValidTimeString(startTime) &&
    isValidTimeString(endTime) &&
    endTime <= startTime
  ) {
    errors.push({
      field: "endTime",
      message: "The end time has to be later than the start time",
    });
  }

  if (isValidTimeString(startTime)) {
    values.startTime = startTime;
  }

  if (isValidTimeString(endTime)) {
    values.endTime = endTime;
  }

  const venue = typeof input?.venue === "string" ? input.venue.trim() : "";

  if (venue.length > MAX_VENUE_LENGTH) {
    errors.push({ field: "venue", message: MAX_VENUE_ERROR });
  } else {
    values.venue = venue.length > 0 ? venue : null;
  }

  const description =
    typeof input?.description === "string" ? input.description.trim() : "";

  if (description.length > MAX_REASON_LENGTH) {
    errors.push({
      field: "description",
      message: `The description can be at most ${MAX_REASON_LENGTH} characters long`,
    });
  } else {
    values.description = description.length > 0 ? description : null;
  }

  return { ok: errors.length === 0, values, errors };
}

export function validateMarks(marks) {
  const errors = [];

  if (!Array.isArray(marks) || marks.length === 0) {
    return {
      ok: false,
      marks: [],
      errors: [{ field: "marks", message: "At least one mark is required" }],
    };
  }

  if (marks.length > MAX_MARKS_PER_REQUEST) {
    return {
      ok: false,
      marks: [],
      errors: [
        {
          field: "marks",
          message: `At most ${MAX_MARKS_PER_REQUEST} marks can be saved at once`,
        },
      ],
    };
  }

  const normalized = [];
  const seen = new Set();

  for (const mark of marks) {
    const userId = typeof mark?.userId === "string" ? mark.userId.trim() : "";

    if (userId.length === 0) {
      errors.push({ field: "marks", message: "Every mark needs a cadet id" });
      continue;
    }

    if (seen.has(userId)) {
      errors.push({
        field: "marks",
        message: "A cadet can only be marked once per session",
      });
      continue;
    }

    seen.add(userId);

    const status = normalizeAttendanceStatus(mark?.status);

    if (!status) {
      errors.push({
        field: "marks",
        message: `Unsupported attendance status: ${String(mark?.status ?? "")}`,
      });
      continue;
    }

    const note = typeof mark?.note === "string" ? mark.note.trim() : "";

    if (note.length > MAX_REASON_LENGTH) {
      errors.push({
        field: "marks",
        message: `A note can be at most ${MAX_REASON_LENGTH} characters long`,
      });
      continue;
    }

    normalized.push({ userId, status, note: note.length > 0 ? note : null });
  }

  return { ok: errors.length === 0, marks: normalized, errors };
}

export function validateLeaveInput(input) {
  const errors = [];
  const values = {};

  const type = normalizeLeaveType(input?.type);

  if (!type) {
    errors.push({
      field: "type",
      message: `The leave type has to be one of: ${LEAVE_TYPES.join(", ")}`,
    });
  } else {
    values.type = type;
  }

  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";

  if (reason.length < 5) {
    errors.push({
      field: "reason",
      message: "The reason needs at least 5 characters",
    });
  } else if (reason.length > MAX_REASON_LENGTH) {
    errors.push({
      field: "reason",
      message: `The reason can be at most ${MAX_REASON_LENGTH} characters long`,
    });
  } else {
    values.reason = reason;
  }

  const startDate = parseDateOnly(input?.startDate);
  const endDate = parseDateOnly(input?.endDate);

  if (!startDate) {
    errors.push({ field: "startDate", message: "The start date is not valid" });
  }

  if (!endDate) {
    errors.push({ field: "endDate", message: "The end date is not valid" });
  }

  if (startDate && endDate && endDate < startDate) {
    errors.push({
      field: "endDate",
      message: "The end date cannot be before the start date",
    });
  }

  if (startDate && endDate && endDate >= startDate) {
    values.startDate = startDate;
    values.endDate = endDate;
  }

  return { ok: errors.length === 0, values, errors };
}

export function parseDateOnly(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (parsed.toISOString().slice(0, 10) !== trimmed) {
    return null;
  }

  return parsed;
}

export function canTransitionSession(status, action) {
  if (action === "open") {
    return status === "DRAFT";
  }

  if (action === "close") {
    return status === "OPEN";
  }

  if (action === "cancel") {
    return ["DRAFT", "OPEN", "CLOSED"].includes(status);
  }

  return false;
}

export function isSessionOpen(session) {
  return session?.status === "OPEN";
}

export function isWithinCheckInWindow(
  session,
  now,
  { beforeMinutes = 30, afterMinutes = 60 } = {}
) {
  if (!session?.startsAt || !session?.endsAt) {
    return false;
  }

  const startsAt = new Date(session.startsAt).getTime();
  const endsAt = new Date(session.endsAt).getTime();
  const current = now.getTime();

  return (
    current >= startsAt - beforeMinutes * 60_000 &&
    current <= endsAt + afterMinutes * 60_000
  );
}
