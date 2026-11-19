import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, ShieldAlert, Mail, CheckCircle2 } from "lucide-react";
import { getSessionUser } from "@/lib/guard";
import PendingActions from "./PendingActions";

export const metadata: Metadata = {
  title: "Application Status | NCC MIT WPU",
  description:
    "The status of your NCC MIT WPU cadet enrolment application and the next steps.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PendingPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  // A deactivated account is shown the deactivated state. It must not be
  // redirected to the portal, because the protected layouts send it back
  // here and the two redirects would loop.
  const isDeactivated = Boolean(user.deactivatedAt);

  if (!isDeactivated && user.approvalStatus === "APPROVED") {
    if (user.role === "ADMIN") {
      redirect("/admin");
    }
    if (user.role === "OFFICER") {
      redirect("/officer");
    }
    redirect("/dashboard");
  }

  const isRejected = user.approvalStatus === "REJECTED";

  return (
    <main className="min-h-screen min-h-[100dvh] bg-ncc-dark-blue flex items-center justify-center py-10 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-10 border border-gray-100">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-16 h-16 rounded-full bg-ncc-dark-blue flex items-center justify-center mx-auto mb-4 relative">
              <Image
                src="/images/logo/ncc-logo.png"
                alt="NCC Logo"
                fill
                className="object-cover rounded-full"
                unoptimized
              />
            </div>
            <p className="text-ncc-red font-bold text-xs uppercase tracking-widest mb-2">
              Unity and Discipline
            </p>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-heading font-black text-ncc-dark-blue tracking-tight">
              {isDeactivated
                ? "Your account is deactivated"
                : isRejected
                ? "Your application was not approved"
                : "Your application is under review"}
            </h1>
          </div>

          <div
            className={`p-4 sm:p-5 rounded-2xl border mb-6 sm:mb-8 flex items-start gap-3 ${
              isDeactivated
                ? "bg-slate-100 border-slate-300 text-slate-700"
                : isRejected
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
          >
            {isDeactivated ? (
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            ) : isRejected ? (
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <div className="text-xs sm:text-sm leading-relaxed">
              <p className="font-bold mb-1">
                Status:{" "}
                {isDeactivated
                  ? "Deactivated"
                  : isRejected
                  ? "Rejected"
                  : "Pending approval"}
              </p>
              <p>
                {isDeactivated
                  ? "Your account was deactivated by an administrator of the unit. The portal features stay locked. Your attendance history, your leave requests and your profile are kept, so the record of the unit stays complete. Write to the unit if you think this is a mistake."
                  : isRejected
                  ? "Your cadet enrolment application was rejected. The portal features stay locked until the ANO reverses this decision."
                  : "Your cadet enrolment application is with the NCC unit administrators. The portal features stay locked until an administrator approves it."}
              </p>
            </div>
          </div>

          <div className="mb-6 sm:mb-8">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-ncc-red mb-3 sm:mb-4">
              What happens next
            </h2>
            <ol className="space-y-3 text-xs sm:text-sm text-gray-600">
              {!isRejected && !isDeactivated && (
                <>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      The unit checks your college email against the imported NCC
                      roster and reviews the details you submitted.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      If your email is on the roster you are approved
                      automatically at your next sign in. Otherwise an
                      administrator reviews your application.
                    </span>
                  </li>
                </>
              )}
              <li className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-ncc-red shrink-0 mt-0.5" />
                <span>
                  For anything else, write to{" "}
                  <a
                    href="mailto:ncc@mitwpu.edu.in"
                    className="text-ncc-red font-semibold underline"
                  >
                    ncc@mitwpu.edu.in
                  </a>{" "}
                  with your name and college email address.
                </span>
              </li>
            </ol>
          </div>

          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 mb-6 sm:mb-8">
            <p className="text-xs text-gray-500">
              Signed in as{" "}
              <span className="font-semibold text-gray-700">{user.email}</span>
            </p>
          </div>

          <PendingActions />
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-white/70 hover:text-white text-xs font-semibold underline"
          >
            Back to the public site
          </Link>
        </div>
      </div>
    </main>
  );
}
