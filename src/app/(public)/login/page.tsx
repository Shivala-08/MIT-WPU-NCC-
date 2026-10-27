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

const errorMessages: Record<string, string> = {
  AccessDenied:
    "Sign-in denied. Only enrolled @mitwpu.edu.in accounts with an approved NCC record can sign in. New candidates should register first.",
  Verification:
    "Sign-in could not be verified. Please try again or contact the administrator.",
  OAuthAccountNotLinked:
    "This Google account is not linked to an NCC record. Please register first.",
  Configuration:
    "Sign-in is not configured correctly. Please contact the administrator.",
  Default:
    "Sign-in failed. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error;
  const errorMessage = errorCode
    ? errorMessages[errorCode] ?? errorMessages.Default
    : undefined;

  return <LoginClient errorMessage={errorMessage} />;
}
