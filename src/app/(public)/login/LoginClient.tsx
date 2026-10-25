"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Shield, Lock, Mail, AlertCircle, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      const { signInWithGoogle } = await import("@/lib/auth");
      const result = await signInWithGoogle();
      // result contains { url: string } for OAuth redirect, or user info
      if (result?.url) {
        // Redirect to Google OAuth
        router.push(result.url);
        router.refresh();
        return;
      }
      
      // Check if email is approved domain
      const { isApprovedEmail } = await import("@/lib/auth");
      // The user is already in session after OAuth redirect
      const user = await import("@/lib/guard").then((mod) => mod.getUser());
      if (user?.email) {
        const approved = await isApprovedEmail(user.email);
        if (!approved) {
          await import("@/lib/auth").then((mod) => mod.signOut());
          setError("Only college email accounts (@mitwpu.edu.in) are allowed for sign-in.");
          setIsLoading(false);
          return;
        }
      }
      
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Sign-in failed. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-ncc-dark-blue flex items-center justify-center py-8 sm:py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background military ornament accents */}
      <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-64 bg-ncc-red/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 sm:w-96 h-64 sm:h-64 bg-ncc-light-blue/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-8 lg:p-10 relative z-10 border border-gray-100"
      >
        {/* Brand Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full overflow-hidden border-2 border-ncc-gold shadow-md">
            <Image
              src="/images/logo/ncc-logo.png"
              alt="NCC Logo"
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-heading font-black text-ncc-dark-blue tracking-tight">
            NCC MIT WPU Portal
          </h1>
          <p className="text-ncc-red font-bold text-xs uppercase tracking-widest mt-1">
            Unity and Discipline
          </p>
        </div>

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Google Sign-In Button */}
        <div className="mt-6 sm:mt-8 text-center">
          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className="w-full py-3 sm:py-3.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light disabled:opacity-50 text-white font-bold text-sm tracking-wide transition-all shadow-lg hover:shadow-ncc-red/30 flex items-center justify-center gap-2 touch-target"
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Sign in with Google <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
          <p className="mt-2 text-xs text-gray-500">
            Only college email accounts (@mitwpu.edu.in) are allowed
          </p>
        </div>

        <div className="mt-4 sm:mt-6 text-center">
          <p className="text-xs text-gray-500">
            New candidate?{" "}
            <Link
              href="/register"
              className="text-ncc-red hover:underline font-bold"
            >
              Apply for Cadet Enrolment
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
