"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Shield, Lock, Mail, AlertCircle, ArrowRight, UserCheck } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Clear any existing session first using next-auth signOut
      await fetch("/api/auth/signout", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callbackUrl: "/login" })
      });
      
      // Small delay to ensure cookie is cleared
      await new Promise((r) => setTimeout(r, 100));
      
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid email or password. Please verify your credentials.");
        setIsLoading(false);
        return;
      }

      // Session might not be ready immediately, retry a few times
      let sessionData = null;
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const sessionRes = await fetch("/api/auth/session");
        sessionData = await sessionRes.json();
        if (sessionData?.user?.role) break;
      }

      if (sessionData?.user?.role === "ADMIN") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch {
      setError("An error occurred during sign-in. Please try again.");
      setIsLoading(false);
    }
  };

  const fillQuickCredentials = (role: "admin" | "cadet") => {
    if (role === "admin") {
      setEmail("admin@ncc-mitwpu.edu.in");
      setPassword("admin123");
    } else {
      setEmail("cadet@mitwpu.edu.in");
      setPassword("cadet123");
    }
    setError("");
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-ncc-dark-blue flex items-center justify-center py-8 sm:py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background military ornament accents */}
      <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-96 bg-ncc-red/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 sm:w-96 h-64 sm:h-96 bg-ncc-light-blue/10 rounded-full blur-3xl pointer-events-none" />

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

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
              Registered Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@ncc-mitwpu.edu.in"
                className="w-full pl-9 sm:pl-11 pr-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 sm:pl-11 pr-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 sm:py-3.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light disabled:opacity-50 text-white font-bold text-sm tracking-wide transition-all shadow-lg hover:shadow-ncc-red/30 flex items-center justify-center gap-2 touch-target"
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Sign In to Portal <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Demo Fast Logins */}
        <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 text-center">
            Demo Credentials (Quick Fill)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillQuickCredentials("admin")}
              className="px-3 py-2 sm:px-3 sm:py-2 bg-gray-50 hover:bg-ncc-dark-blue hover:text-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 transition-all flex items-center justify-center gap-1.5 touch-target"
            >
              <Shield className="w-3.5 h-3.5 text-ncc-red" /> Fill Admin
            </button>
            <button
              type="button"
              onClick={() => fillQuickCredentials("cadet")}
              className="px-3 py-2 sm:px-3 sm:py-2 bg-gray-50 hover:bg-ncc-dark-blue hover:text-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 transition-all flex items-center justify-center gap-1.5 touch-target"
            >
              <UserCheck className="w-3.5 h-3.5 text-ncc-light-blue" /> Fill Cadet
            </button>
          </div>
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
