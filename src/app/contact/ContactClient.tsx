"use client";

import { useState } from "react";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  Building2,
  Shield,
} from "lucide-react";
import { AnimatedSection } from "@/components/AnimatedSection";

export default function ContactClient() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit message");
      }

      setSubmitStatus("success");
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (err: any) {
      setSubmitStatus("error");
      setErrorMessage(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      {/* Header Banner */}
      <div className="bg-ncc-dark-blue text-white py-12 sm:py-16 mb-8 sm:mb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ncc-gold/20 text-ncc-gold text-xs font-semibold tracking-wider uppercase mb-3 sm:mb-4">
            <Mail className="w-3.5 h-3.5" /> Communications
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-heading font-black tracking-tight mb-3 sm:mb-4">
            Contact NCC MIT WPU
          </h1>
          <p className="max-w-2xl mx-auto text-white/70 text-sm sm:text-base lg:text-lg">
            Have questions about enrollments, training schedules, or camp activities? Get in touch with our unit leadership.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12">
          {/* Contact Details & Map */}
          <div className="lg:col-span-5 space-y-6 sm:space-y-8">
            <AnimatedSection>
              <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-4 sm:space-y-6">
                <h2 className="font-heading font-bold text-xl sm:text-2xl text-gray-900 border-b pb-3 sm:pb-4">
                  Unit Headquarters
                </h2>

                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-ncc-red/10 text-ncc-red shrink-0">
                    <MapPin className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs sm:text-sm">Campus Address</h3>
                    <p className="text-gray-600 text-xs sm:text-sm mt-0.5 sm:mt-1 leading-relaxed">
                      MIT World Peace University (MIT-WPU)
                      <br />
                      S.No. 124, Paud Road, Kothrud,
                      <br />
                      Pune, Maharashtra - 411038
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-ncc-dark-blue/10 text-ncc-dark-blue shrink-0">
                    <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs sm:text-sm">Affiliation & Group HQ</h3>
                    <p className="text-gray-600 text-xs sm:text-sm mt-0.5 sm:mt-1">
                      NCC Group Headquarters, Pune
                      <br />
                      Maharashtra Directorate
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-ncc-light-blue/20 text-ncc-dark-blue shrink-0">
                    <Mail className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs sm:text-sm">Email Inquiries</h3>
                    <a
                      href="mailto:ncc@mitwpu.edu.in"
                      className="text-ncc-red hover:underline text-xs sm:text-sm font-medium mt-0.5 sm:mt-1 block"
                    >
                      ncc@mitwpu.edu.in
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-emerald-50 text-emerald-700 shrink-0">
                    <Phone className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs sm:text-sm">Campus Helpline</h3>
                    <a
                      href="tel:+912025634000"
                      className="text-gray-700 hover:text-ncc-red text-xs sm:text-sm font-medium mt-0.5 sm:mt-1 block"
                    >
                      +91 20 2563 4000
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-amber-50 text-amber-700 shrink-0">
                    <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs sm:text-sm">Parade & Office Timings</h3>
                    <p className="text-gray-600 text-xs sm:text-sm mt-0.5 sm:mt-1">
                      Saturday Parades: 06:30 AM - 10:30 AM
                      <br />
                      Unit Office: Mon - Fri, 09:00 AM - 05:00 PM
                    </p>
                  </div>
                </div>
              </div>
            </AnimatedSection>

            {/* Embedded Map Container */}
            <AnimatedSection>
              <div className="bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-gray-200 shadow-sm p-1.5 sm:p-2">
                <div className="p-3 sm:p-4 border-b">
                  <h3 className="font-heading font-bold text-gray-900 text-xs sm:text-sm flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-ncc-red" /> Campus Map Location
                  </h3>
                </div>
                <div className="relative aspect-[4/3] sm:aspect-[16/10] w-full rounded-2xl overflow-hidden bg-gray-100">
                  <iframe
                    title="MIT WPU Location Map"
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3783.250392186981!2d73.81242397519163!3d18.51758998257489!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bc2bfb990000001%3A0x2db48f8c85c5bb99!2sMIT%20World%20Peace%20University!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin"
                    className="absolute inset-0 w-full h-full border-0"
                    loading="lazy"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  />
                </div>
              </div>
            </AnimatedSection>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-7">
            <AnimatedSection>
              <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-10 border border-gray-200 shadow-sm">
                <div className="mb-6 sm:mb-8">
                  <span className="text-ncc-red font-bold text-xs uppercase tracking-wider">
                    Direct Inquiry
                  </span>
                  <h2 className="text-xl sm:text-2xl font-heading font-bold text-gray-900 mt-1">
                    Send a Message to the Unit
                  </h2>
                  <p className="text-gray-500 text-xs sm:text-sm mt-1">
                    Fill out the form below. Messages are recorded securely in the NCC unit registry and reviewed by officers.
                  </p>
                </div>

                {submitStatus === "success" && (
                  <div className="mb-6 p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm">Message Transmitted Successfully!</p>
                      <p className="text-xs text-emerald-700 mt-1">
                        Thank you for reaching out. The NCC MIT WPU team will respond to your email address shortly.
                      </p>
                    </div>
                  </div>
                )}

                {submitStatus === "error" && (
                  <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                    <p className="text-sm font-medium">{errorMessage}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label htmlFor="name" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Full Name *
                      </label>
                      <input
                        id="name"
                        type="text"
                        autoComplete="name"
                        required
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="Cadet or Visitor Name"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                        Email Address *
                      </label>
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="name@mitwpu.edu.in"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                      Subject *
                    </label>
                    <input
                      id="subject"
                      type="text"
                      required
                      value={formData.subject}
                      onChange={(e) =>
                        setFormData({ ...formData, subject: e.target.value })
                      }
                      placeholder="e.g. Admission Inquiry / Camp Attendance Verification"
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 sm:mb-2">
                      Detailed Message *
                    </label>
                    <textarea
                      id="message"
                      rows={4}
                      required
                      value={formData.message}
                      onChange={(e) =>
                        setFormData({ ...formData, message: e.target.value })
                      }
                      placeholder="Type your message, roll number, or question here..."
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 sm:py-4 rounded-xl bg-ncc-red hover:bg-ncc-red-light disabled:opacity-50 text-white font-bold text-sm tracking-wide transition-all shadow-lg hover:shadow-ncc-red/30 flex items-center justify-center gap-2 touch-target"
                  >
                    {isSubmitting ? (
                      <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" /> Send Message to Unit
                      </>
                    )}
                  </button>
                </form>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </div>
    </div>
  );
}
