"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Shield,
  User,
  Mail,
  Lock,
  Phone,
  Calendar,
  Building,
  Activity,
  CheckCircle2,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import { AnimatedSection } from "@/components/AnimatedSection";

const registerFormSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Valid email address is required"),
  regiNumber: z.string().optional(),
  wing: z.enum(["Army", "Navy", "Air"]),
  division: z.string(),
  year: z.string().min(1, "Select academic year"),
  branch: z.string().min(2, "Branch/Department is required"),
  prn: z.string().optional(),
  dob: z.string().min(1, "Date of birth is required"),
  bloodGroup: z.string().min(1, "Blood group is required"),
  gender: z.enum(["Male", "Female", "Other"]),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  address: z.string().optional(),
  parentContact: z.string().optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  emergencyContact: z.string().optional(),
});

type RegisterFormData = z.infer<typeof registerFormSchema>;

export default function RegisterClient() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      wing: "Army",
      division: "SD",
      gender: "Male",
      year: "1st Year",
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Enrollment submission failed");
      }

      setIsSuccess(true);
    } catch (err: any) {
      setServerError(err.message || "An unexpected error occurred. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      {/* Header */}
      <div className="bg-ncc-dark-blue text-white py-12 sm:py-16 mb-8 sm:mb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ncc-gold/20 text-ncc-gold text-xs font-semibold tracking-wider uppercase mb-3 sm:mb-4">
            <Shield className="w-3.5 h-3.5" /> Enlistment Portal
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-heading font-black tracking-tight mb-3 sm:mb-4">
            New Cadet Enrolment
          </h1>
          <p className="max-w-2xl mx-auto text-white/70 text-sm sm:text-base lg:text-lg">
            Join the National Cadet Corps unit at MIT World Peace University. Discipline, Leadership, and Pride of the Nation.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {isSuccess ? (
          <AnimatedSection>
            <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-12 border border-gray-200 shadow-md text-center max-w-2xl mx-auto">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-heading font-black text-gray-900 mb-3 sm:mb-4">
                Application Successfully Logged!
              </h2>
              <p className="text-gray-600 text-xs sm:text-sm leading-relaxed mb-4 sm:mb-6">
                Your cadet enrolment application is now in <strong className="text-ncc-red">Pending Verification</strong> status. 
                Our Associate NCC Officer (ANO) and unit administrators will review your credentials and medical stats.
              </p>
              <div className="p-3 sm:p-4 bg-gray-50 rounded-2xl border border-gray-200 text-xs sm:text-xs text-gray-500 mb-6 sm:mb-8 text-left">
                <p className="font-semibold text-gray-700 mb-1">What happens next?</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Physical test & interview schedule will be sent to your registered email.</li>
                  <li>Once approved, you can log in to view your attendance and study materials.</li>
                </ul>
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                <Link
                  href="/login"
                  className="px-5 py-2.5 sm:px-6 sm:py-3 bg-ncc-dark-blue hover:bg-ncc-dark-blue/90 text-white font-bold text-xs sm:text-sm rounded-xl transition-all touch-target"
                >
                  Proceed to Login
                </Link>
                <Link
                  href="/"
                  className="px-5 py-2.5 sm:px-6 sm:py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs sm:text-sm rounded-xl transition-all touch-target"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          </AnimatedSection>
        ) : (
          <AnimatedSection>
            <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-12 border border-gray-200 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-4 sm:pb-6 mb-6 sm:mb-8 gap-2">
                <div>
                  <h2 className="font-heading font-black text-xl sm:text-2xl text-gray-900">
                    Cadet Enrolment Application
                  </h2>
                  <p className="text-gray-500 text-xs sm:text-sm mt-0.5 sm:mt-1">
                    All fields marked with an asterisk (*) are mandatory.
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full sm:hidden">
                  Status: Pending Approval
                </span>
                <span className="hidden sm:inline-block px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                  Status: Pending Approval
                </span>
              </div>

              {serverError && (
                <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-medium">{serverError}</p>
                </div>
              )}                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 sm:space-y-8">
                {/* Personal Information */}
                <div>
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-ncc-red mb-3 sm:mb-4 flex items-center gap-2">
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 1. Personal Credentials
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label htmlFor="fullName" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Full Name (as per ID) *
                      </label>
                      <input
                        id="fullName"
                        type="text"
                        inputMode="text"
                        {...register("fullName")}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                      {errors.fullName && (
                        <p className="text-red-500 text-xs mt-0.5 sm:mt-1">{errors.fullName.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Email Address *
                      </label>
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        {...register("email")}
                        placeholder="cadet@mitwpu.edu.in"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                      {errors.email && (
                        <p className="text-red-500 text-xs mt-0.5 sm:mt-1">{errors.email.message}</p>
                      )}
                    </div>

                    

                    <div>
                      <label htmlFor="phone" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Mobile Phone Number *
                      </label>
                      <input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        {...register("phone")}
                        placeholder="10-digit mobile number"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                      {errors.phone && (
                        <p className="text-red-500 text-xs mt-0.5 sm:mt-1">{errors.phone.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="dob" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Date of Birth *
                      </label>
                      <input
                        id="dob"
                        type="date"
                        {...register("dob")}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                      {errors.dob && (
                        <p className="text-red-500 text-xs mt-0.5 sm:mt-1">{errors.dob.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="gender" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Gender *
                      </label>
                      <select
                        id="gender"
                        {...register("gender")}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red bg-white"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Academic & NCC Wing */}
                <div className="pt-4 sm:pt-6 border-t">
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-ncc-dark-blue mb-3 sm:mb-4 flex items-center gap-2">
                    <Building className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 2. Academic & NCC Enrolment Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                    <div>
                      <label htmlFor="wing" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        NCC Wing *
                      </label>
                      <select
                        id="wing"
                        {...register("wing")}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red bg-white"
                      >
                        <option value="Army">Army Wing</option>
                        <option value="Navy">Naval Wing</option>
                        <option value="Air">Air Wing</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="division" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Division *
                      </label>
                      <select
                        id="division"
                        {...register("division")}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red bg-white"
                      >
                        <option value="SD">SD (Senior Division - Boys)</option>
                        <option value="SW">SW (Senior Wing - Girls)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="year" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Academic Year *
                      </label>
                      <select
                        id="year"
                        {...register("year")}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red bg-white"
                      >
                        <option value="1st Year">1st Year (FY)</option>
                        <option value="2nd Year">2nd Year (SY)</option>
                        <option value="3rd Year">3rd Year (TY)</option>
                        <option value="4th Year">4th Year (Final)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor="branch" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Degree Branch / Department *
                      </label>
                      <input
                        id="branch"
                        type="text"
                        {...register("branch")}
                        placeholder="e.g. B.Tech Computer Science & Engineering"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                      {errors.branch && (
                        <p className="text-red-500 text-xs mt-0.5 sm:mt-1">{errors.branch.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="prn" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        University PRN (Optional)
                      </label>
                      <input
                        id="prn"
                        type="text"
                        {...register("prn")}
                        placeholder="e.g. 1032200123"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                    </div>

                    <div>
                      <label htmlFor="regiNumber" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Regimental Enrolment No. (If already allotted)
                      </label>
                      <input
                        id="regiNumber"
                        type="text"
                        {...register("regiNumber")}
                        placeholder="e.g. MAH/SD/24/104"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                    </div>
                  </div>
                </div>

                {/* Health & Emergency Stats */}
                <div className="pt-4 sm:pt-6 border-t">
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-700 mb-3 sm:mb-4 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 3. Physical & Emergency Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                    <div>
                      <label htmlFor="bloodGroup" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Blood Group *
                      </label>
                      <select
                        id="bloodGroup"
                        {...register("bloodGroup")}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red bg-white"
                      >
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="height" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Height (in cm)
                      </label>
                      <input
                        id="height"
                        type="number"
                        inputMode="decimal"
                        {...register("height")}
                        placeholder="e.g. 172"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                    </div>

                    <div>
                      <label htmlFor="weight" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Weight (in kg)
                      </label>
                      <input
                        id="weight"
                        type="number"
                        inputMode="decimal"
                        {...register("weight")}
                        placeholder="e.g. 65"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor="parentContact" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Parent / Guardian Contact Number
                      </label>
                      <input
                        id="parentContact"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        {...register("parentContact")}
                        placeholder="Parent mobile number"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                    </div>

                    <div>
                      <label htmlFor="emergencyContact" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Emergency Contact
                      </label>
                      <input
                        id="emergencyContact"
                        type="text"
                        {...register("emergencyContact")}
                        placeholder="Emergency contact name & phone"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor="address" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Residential Address in Pune / Permanent
                      </label>
                      <textarea
                        id="address"
                        rows={2}
                        {...register("address")}
                        placeholder="Hostel or residence address..."
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 sm:pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                  <p className="text-xs text-gray-500 text-center sm:text-left">
                    By submitting, you pledge adherence to the NCC motto <em>"Unity and Discipline"</em>.
                  </p>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light disabled:opacity-50 text-white font-bold text-sm tracking-wide transition-all shadow-lg hover:shadow-ncc-red/30 flex items-center justify-center gap-2 touch-target"
                  >
                    {isSubmitting ? (
                      <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Shield className="w-4 h-4" /> Submit Application
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </AnimatedSection>
        )}
      </div>
    </div>
  );
}
