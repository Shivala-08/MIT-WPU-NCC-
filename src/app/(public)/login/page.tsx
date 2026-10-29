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
    "Sign-in denied. Only @mitwpu.edu.in accounts with a verified Google email can sign in.",
  Verification:
    "Sign-in could not be verified. Please try again or contact the administrator.",
  OAuthAccountNotLinked:
    "This Google account could not be linked to the NCC portal. Please try again.",
  Configuration:
    "Sign-in is not configured correctly. Please contact the administrator.",
  Default: "Sign-in failed. Please try again.",
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
