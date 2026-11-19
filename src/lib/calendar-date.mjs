/**
 * Helpers for the calendar dates of the unit.
 *
 * A calendar date ("2026-11-02") is not a point in time. The unit works in
 * India Standard Time, so a timestamp has to be shifted into IST before the
 * day is read. A date only value keeps the day it was written with.
 */

export const IST_OFFSET_MINUTES = 330;

export const IST_TIME_ZONE = "Asia/Kolkata";

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function formatParts(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * The calendar day of a date only value.
 *
 * The date only columns of the database keep midnight UTC. Reading the UTC
 * parts returns exactly the day that was written and never the day before.
 */
export function toCalendarDate(value) {
  const date = toDate(value);

  return date ? formatParts(date) : null;
}

/**
 * The calendar day of a timestamp in a time zone with a fixed offset.
 */
export function toCalendarDateInOffset(
  value,
  offsetMinutes = IST_OFFSET_MINUTES
) {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  return formatParts(new Date(date.getTime() + offsetMinutes * 60_000));
}

/**
 * The calendar day of a timestamp in India Standard Time.
 */
export function toIstCalendarDate(value) {
  return toCalendarDateInOffset(value, IST_OFFSET_MINUTES);
}

/**
 * The first instant of a calendar day in India Standard Time.
 */
export function startOfIstDay(calendarDate) {
  if (
    typeof calendarDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)
  ) {
    return null;
  }

  const parsed = new Date(`${calendarDate}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getTime() - IST_OFFSET_MINUTES * 60_000);
}

/**
 * The last instant of a calendar day in India Standard Time.
 */
export function endOfIstDay(calendarDate) {
  const start = startOfIstDay(calendarDate);

  if (!start) {
    return null;
  }

  return new Date(start.getTime() + 24 * 60 * 60_000 - 1);
}

/**
 * A readable date of a date only value. The day never shifts.
 */
export function formatCalendarDate(value, locale = "en-IN") {
  const date = toDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * The time of a timestamp in India Standard Time.
 */
export function formatIstTime(value, locale = "en-IN") {
  return formatIstDateTime(value, locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The calendar day of today in India Standard Time.
 *
 * The value is computed on the server and passed to the client. The browser
 * never decides which day it is, so the server and the client always render
 * the same value.
 */
export function todayInIst(now = new Date()) {
  return toIstCalendarDate(now) ?? formatParts(now);
}

/**
 * A readable date and time of a timestamp in India Standard Time.
 */
export function formatIstDateTime(
  value,
  locale = "en-IN",
  options = {}
) {
  const date = toDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: IST_TIME_ZONE,
  }).format(date);
}
