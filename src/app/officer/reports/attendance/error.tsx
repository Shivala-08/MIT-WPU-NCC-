"use client";

import AttendanceError from "@/components/attendance/AttendanceError";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AttendanceError error={error} reset={reset} backHref="/officer/reports/attendance" backLabel="Back to the reports" />;
}
