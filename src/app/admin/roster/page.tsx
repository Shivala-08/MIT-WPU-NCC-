import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RosterManagerClient from "./RosterManagerClient";

export const metadata: Metadata = {
  title: "Roster Manager | NCC MIT WPU",
  description: "Import, search and deactivate the NCC roster.",
};

export default function RosterManagerPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-ncc-red"
        >
          <ArrowLeft className="w-4 h-4" /> Back to the command center
        </Link>

        <RosterManagerClient />
      </div>
    </div>
  );
}
