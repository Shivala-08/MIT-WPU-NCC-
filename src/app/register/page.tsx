import { Metadata } from "next";
import RegisterClient from "./RegisterClient";

export const metadata: Metadata = {
  title: "Cadet Enrolment | NCC MIT WPU",
  description:
    "Apply to join the National Cadet Corps unit at MIT World Peace University. Army, Navy, and Air Wing registrations open for first and second year students.",
  openGraph: {
    title: "Join NCC at MIT WPU - Cadet Enrolment",
    description: "Apply to join the National Cadet Corps unit at MIT World Peace University.",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "NCC MIT WPU Cadet Enrolment",
    description: "Apply to join the National Cadet Corps unit at MIT World Peace University.",
  },
};

export default function RegisterPage() {
  return <RegisterClient />;
}
