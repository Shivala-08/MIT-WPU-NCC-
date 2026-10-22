import { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Portal Sign In | NCC MIT WPU",
  description: "Secure login for NCC cadets and officers at MIT World Peace University.",
  openGraph: {
    title: "NCC MIT WPU Portal Sign In",
    description: "Secure login for NCC cadets and officers at MIT World Peace University.",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "NCC MIT WPU Login",
    description: "Secure login for NCC cadets and officers.",
  },
};

export default function LoginPage() {
  return <LoginClient />;
}
