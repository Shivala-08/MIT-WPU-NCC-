import type { Metadata } from "next";
import CadetAttendanceClient from "@/components/attendance/CadetAttendanceClient";

export const metadata: Metadata = {
  title: "My Attendance | NCC MIT WPU",
  description: "Your own attendance record for the sessions of the unit.",
};

export default function CadetAttendancePage() {
  return <CadetAttendanceClient />;
}
