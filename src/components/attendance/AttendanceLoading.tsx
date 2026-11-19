import { Loader2 } from "lucide-react";

/**
 * The loading state of the attendance screens.
 *
 * The page is a server component that reads the database. This fallback keeps
 * the layout stable while the data arrives.
 */
export default function AttendanceLoading({
  title = "Loading",
}: {
  title?: string;
}) {
  return (
    <div className="min-h-screen bg-gray-100 py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="bg-ncc-dark-blue text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <div className="h-7 w-56 rounded-lg bg-white/10" />
          <div className="h-4 w-80 max-w-full rounded-lg bg-white/10 mt-3" />
        </div>

        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" /> {title}
          </div>
        </div>
      </div>
    </div>
  );
}
