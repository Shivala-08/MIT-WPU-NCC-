"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut, LogIn } from "lucide-react";

export default function PendingActions() {
  return (
    <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
      <Link
        href="/login"
        className="px-5 py-2.5 sm:px-6 sm:py-3 bg-ncc-dark-blue hover:bg-ncc-dark-blue/90 text-white font-bold text-xs sm:text-sm rounded-xl transition-all touch-target inline-flex items-center justify-center gap-2"
      >
        <LogIn className="w-4 h-4" />
        Back to sign in
      </Link>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="px-5 py-2.5 sm:px-6 sm:py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs sm:text-sm rounded-xl transition-all touch-target inline-flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </div>
  );
}
