import Link from "next/link";
import { Shield } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-ncc-red flex items-center justify-center mb-4">
        <Shield className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-3xl font-heading font-black text-ncc-dark-blue mb-2">
        404
      </h1>
      <p className="text-gray-600 mb-6 max-w-sm">
        This page is not part of the NCC MIT WPU portal. It may have been moved
        or removed.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-6 py-3 bg-ncc-dark-blue hover:bg-ncc-dark-blue/90 text-white font-bold rounded-xl transition-all"
      >
        Return Home
      </Link>
    </div>
  );
}
