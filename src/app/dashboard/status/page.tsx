import { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { Shield, Clock, CheckCircle2, XCircle, AlertCircle, User, Mail, Loader2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Application Status",
  description: "Track your NCC cadet enrolment application status.",
};

const statusConfig = {
  SUBMITTED: {
    label: "Submitted",
    description: "Your application has been received and is awaiting initial review.",
    icon: Clock,
    color: "text-blue-600 bg-blue-100 border-blue-200",
    progress: 20,
  },
  "UNDER REVIEW": {
    label: "Under Review",
    description: "The ANO and unit officers are verifying your documents and medical details.",
    icon: Loader2,
    color: "text-amber-600 bg-amber-100 border-amber-200",
    progress: 50,
  },
  APPROVED: {
    label: "Approved",
    description: "Congratulations! You have been enrolled as a cadet. Your regimental number will be allotted shortly.",
    icon: CheckCircle2,
    color: "text-emerald-600 bg-emerald-100 border-emerald-200",
    progress: 100,
  },
  REJECTED: {
    label: "Rejected",
    description: "Your application was not approved. Please contact the ANO for details.",
    icon: XCircle,
    color: "text-red-600 bg-red-100 border-red-200",
    progress: 0,
  },
  INVITED: {
    label: "Invited",
    description: "You have been invited to activate your account. Use the activation code provided.",
    icon: Mail,
    color: "text-blue-600 bg-blue-100 border-blue-200",
    progress: 30,
  },
  PENDING: {
    label: "Pending Verification",
    description: "Your application is pending administrative verification.",
    icon: Clock,
    color: "text-amber-600 bg-amber-100 border-amber-200",
    progress: 40,
  },
} as const;

type StatusKey = keyof typeof statusConfig;

function StatusIcon({ icon: Icon, color }: { icon: React.ComponentType<{ className?: string }>; color: string }) {
  return <Icon className={`w-6 h-6 ${color}`} />;
}

function StatusStep({ step, current, config }: { step: number; current: number; config: typeof statusConfig[StatusKey] }) {
  const isActive = step <= current;
  const isCurrent = step === current;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 text-sm font-bold transition-all">
        {isActive ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        ) : step}
      </div>
      <div className="hidden sm:block">
        <p className={`text-xs font-bold ${isActive ? "text-emerald-700" : "text-gray-400"}`}>
          {config.label}
        </p>
        <p className="text-[10px] text-gray-500">{config.description}</p>
      </div>
      {step < 4 && (
        <div className={`h-2 flex-1 max-w-24 rounded transition-colors ${isActive ? "bg-emerald-500" : "bg-gray-200"}`} />
      )}
    </div>
  );
}

export default async function ApplicationStatusPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role === "ADMIN") {
    redirect("/admin");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      cadetProfile: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const profile = user.cadetProfile;
  const rawStatus = (profile?.status || "SUBMITTED").toUpperCase() as StatusKey;
  const status = statusConfig[rawStatus] || statusConfig.SUBMITTED;
  const statusOrder = ["SUBMITTED", "UNDER REVIEW", "APPROVED", "REJECTED", "INVITED", "PENDING"];
  const currentStep = statusOrder.indexOf(rawStatus) + 1;

  const isPendingOrRejected = ["PENDING", "SUBMITTED", "UNDER REVIEW", "INVITED"].includes(rawStatus);
  const isRejected = rawStatus === "REJECTED";
  const isApproved = rawStatus === "APPROVED";

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8">
        <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-ncc-red/10 flex items-center justify-center">
              <Shield className="w-8 h-8 text-ncc-red" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-black text-ncc-dark-blue mb-2">
              Application Status Tracker
            </h1>
            <p className="text-gray-500 text-sm">
              Track your cadet enrolment application in real-time
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-50 rounded-xl p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Current Status
                  </p>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status.color}`}>
                      <StatusIcon icon={status.icon} color="text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-heading font-black text-ncc-dark-blue">
                        {status.label}
                      </h2>
                      <p className="text-sm text-gray-600 mt-0.5">{status.description}</p>
                    </div>
                  </div>
                </div>
                <div className="w-full sm:w-48">
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isApproved ? "bg-emerald-500" : isRejected ? "bg-red-500" : "bg-ncc-red"
                      }`}
                      style={{ width: `${status.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-right mt-1">{status.progress}% complete</p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Progress Timeline</p>
              <div className="space-y-4">
                {statusOrder.slice(0, 4).map((s, i) => {
                  const cfg = statusConfig[s as StatusKey];
                  const isCompleted = i + 1 < currentStep;
                  const isCurrentStep = i + 1 === currentStep;
                  return (
                    <div key={s} className="flex items-start gap-4">
                      <div className="relative flex-shrink-0">
                        <div
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold z-10 transition-all ${
                            isCompleted
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : isCurrentStep
                              ? "bg-ncc-red border-ncc-red text-white animate-pulse"
                              : "bg-white border-gray-300 text-gray-400"
                          }`}
                        >
                          {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
                        </div>
                        {i < 3 && (
                          <div className="absolute left-3.5 top-8 bottom-0 w-0.5" style={{ height: isCompleted ? "100%" : "0" }}>
                            <div className="h-full bg-emerald-500" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className={`font-semibold text-sm ${isCompleted || isCurrentStep ? "text-ncc-dark-blue" : "text-gray-500"}`}>
                          {cfg.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{cfg.description}</p>
                        {isCurrentStep && (
                          <p className="text-xs text-ncc-red font-medium mt-1">← You are here</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {profile && (
          <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
            <h2 className="font-heading font-bold text-lg text-ncc-dark-blue mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-ncc-red" />
              Your Application Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Full Name</p>
                <p className="font-semibold text-gray-900">{profile.fullName || user.name}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Email</p>
                <p className="text-gray-700">{user.email}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Wing</p>
                <p className="font-semibold text-ncc-dark-blue">{profile.wing || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Year / Branch</p>
                <p className="text-gray-700">{profile.year || "—"} • {profile.branch || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Regimental Number</p>
                <p className="font-mono text-gray-700">{profile.regiNumber || "Not allotted yet"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">PRN</p>
                <p className="text-gray-700">{profile.prn || "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Submitted On</p>
                <p className="text-gray-700">
                  {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}
                </p>
              </div>
            </div>
          </div>
        )}

        {isPendingOrRejected && (
          <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
            <h3 className="font-heading font-bold text-lg text-ncc-dark-blue mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              What Happens Next?
            </h3>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-ncc-red/10 text-ncc-red flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <span>ANO reviews applications weekly (typically every Monday).</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-ncc-red/10 text-ncc-red flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <span>Physical test & medical exam schedule will be emailed to you.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-ncc-red/10 text-ncc-red flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <span>After clearance, status changes to <strong className="text-emerald-600">Approved</strong> and regimental number is allotted.</span>
              </li>
              {isRejected && (
                <li className="flex items-start gap-3 text-red-600">
                  <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold flex-shrink-0">!</span>
                  <span>Your application was rejected. Contact the ANO at <a href="mailto:ncc@mitwpu.edu.in" className="underline">ncc@mitwpu.edu.in</a> for details and re-application guidance.</span>
                </li>
              )}
            </ul>
          </div>
        )}

        {isApproved && (
          <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
            <h3 className="font-heading font-bold text-lg text-ncc-dark-blue mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Welcome to NCC MIT WPU!
            </h3>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <span>Your regimental number has been allotted (see above).</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <span>Access the <Link href="/dashboard" className="text-ncc-red underline">Cadet Dashboard</Link> for attendance, study materials, and notices.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <span>Complete your profile (upload photo, update contact details) within 7 days.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                <span>First parade schedule will be posted on the <Link href="/dashboard" className="text-ncc-red underline">Noticeboard</Link>.</span>
              </li>
            </ul>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/dashboard"
                className="px-5 py-2.5 bg-ncc-dark-blue hover:bg-ncc-dark-blue/90 text-white font-bold text-sm rounded-xl transition-all shadow-md text-center touch-target"
              >
                Go to Dashboard
              </Link>
              <Link
                href="/study-materials"
                className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-xl transition-all text-center touch-target"
              >
                Browse Study Materials
              </Link>
            </div>
          </div>
        )}

        <div className="text-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-ncc-red hover:underline font-bold text-sm"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}