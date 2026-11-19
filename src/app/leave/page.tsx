import type { Metadata } from "next";
import CadetLeaveClient from "@/components/attendance/CadetLeaveClient";
import { todayInIst } from "@/lib/calendar-date.mjs";

export const metadata: Metadata = {
  title: "Leave Requests | NCC MIT WPU",
  description: "Send a leave request and follow the decision of the unit.",
};

export default function LeavePage() {
  // The day comes from the server. The browser never decides which day it is,
  // so the server and the client render the same form.
  return <CadetLeaveClient today={todayInIst()} />;
}
