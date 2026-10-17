import { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Portal Sign In | NCC MIT WPU",
  description: "Secure login for NCC cadets and officers at MIT World Peace University.",
};

export default function LoginPage() {
  return <LoginClient />;
}
