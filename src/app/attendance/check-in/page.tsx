import type { Metadata } from "next";
import CheckInClient from "@/components/attendance/CheckInClient";

export const metadata: Metadata = {
  title: "QR Check-in | NCC MIT WPU",
  description: "Check in to an open attendance session with the QR code of the officer.",
};

export default function CheckInPage() {
  return <CheckInClient />;
}
