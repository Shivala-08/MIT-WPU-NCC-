"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginClient({ errorMessage }: { errorMessage?: string }) {
  const [error, setError] = useState(errorMessage ?? "");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    setError("");
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
      setIsLoading(false);
    } catch {
      setError("Sign-in failed. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-ncc-dark-blue flex items-center justify-center py-8 sm:py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background military ornament accents */}
      <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:w-96 bg-ncc-red/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 sm:w-96 h-64 sm:w-96 bg-ncc-light-blue/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-8 lg:p-10 relative z-10 border border-gray-100"
      >
        {/* Brand Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-16 h-16 mx-auto mb-3 sm:mb-4 rounded-full overflow-hidden border-2 border-ncc-gold shadow-md relative">
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
              Submit a cadet application
            </Link>
          </p>
          <p className="mt-2 text-[11px] text-gray-400">
            New college accounts start as pending and unlock the portal once an
            administrator approves them.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
