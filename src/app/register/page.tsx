import { Metadata } from "next";
import RegisterClient from "./RegisterClient";

export const metadata: Metadata = {
  title: "Cadet Enrolment | NCC MIT WPU",
  description:
    "Apply to join the National Cadet Corps unit at MIT World Peace University. Army, Navy, and Air Wing registrations open for first and second year students.",
};

export default function RegisterPage() {
  return <RegisterClient />;
}
