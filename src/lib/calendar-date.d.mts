export const IST_OFFSET_MINUTES: number;
export const IST_TIME_ZONE: string;

export function toCalendarDate(value: unknown): string | null;
export function toCalendarDateInOffset(
  value: unknown,
  offsetMinutes?: number
): string | null;
export function toIstCalendarDate(value: unknown): string | null;
export function startOfIstDay(calendarDate: unknown): Date | null;
export function endOfIstDay(calendarDate: unknown): Date | null;
export function formatCalendarDate(value: unknown, locale?: string): string;
export function formatIstDateTime(
  value: unknown,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string;
export function todayInIst(now?: Date): string;
export function formatIstTime(value: unknown, locale?: string): string;
