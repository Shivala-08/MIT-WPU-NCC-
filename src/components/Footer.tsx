"use client";

import Link from "next/link";
import Image from "next/image";
import {
  MapPin,
  Phone,
  Mail,
} from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-ncc-dark-blue text-white relative overflow-hidden">
      {/* Decorative top border */}
      <div className="h-1 bg-gradient-to-r from-ncc-red via-ncc-gold to-ncc-light-blue" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border-2 border-ncc-gold/60">
                <Image
                  src="/images/logo/ncc-logo.png"
                  alt="NCC MIT WPU Logo"
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg sm:text-xl">NCC MIT WPU</h3>
                <p className="text-ncc-gold text-xs tracking-wider font-medium">
                  Unity and Discipline
                </p>
              </div>
            </div>
            <p className="text-white/60 text-sm leading-relaxed mb-4 sm:mb-6">
              The National Cadet Corps unit at MIT World Peace University, Pune,
              dedicated to developing character, comradeship, discipline,
              leadership, and the spirit of selfless service among the youth.
            </p>
            <div className="flex gap-2 sm:gap-3">
              <a
                href="#"
                aria-label="Facebook"
                className="w-10 h-10 rounded-lg bg-white/5 hover:bg-ncc-red/20 border border-white/10 hover:border-ncc-red/40 flex items-center justify-center text-white/60 hover:text-ncc-red-light transition-all duration-300"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="w-10 h-10 rounded-lg bg-white/5 hover:bg-ncc-red/20 border border-white/10 hover:border-ncc-red/40 flex items-center justify-center text-white/60 hover:text-ncc-red-light transition-all duration-300"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </a>
              <a
                href="#"
                aria-label="Twitter"
                className="w-10 h-10 rounded-lg bg-white/5 hover:bg-ncc-red/20 border border-white/10 hover:border-ncc-red/40 flex items-center justify-center text-white/60 hover:text-ncc-red-light transition-all duration-300"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a
                href="#"
                aria-label="YouTube"
                className="w-10 h-10 rounded-lg bg-white/5 hover:bg-ncc-red/20 border border-white/10 hover:border-ncc-red/40 flex items-center justify-center text-white/60 hover:text-ncc-red-light transition-all duration-300"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-heading font-bold text-base sm:text-lg mb-4 sm:mb-6 text-ncc-gold">
              Quick Links
            </h4>
            <ul className="space-y-2.5 sm:space-y-3">
              {[
                { href: "/about", label: "About Us" },
                { href: "/events", label: "Events" },
                { href: "/gallery", label: "Gallery" },
                { href: "/activities", label: "Activities" },
                { href: "/study-materials", label: "Study Material" },
                { href: "/register", label: "Register" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/60 hover:text-ncc-gold text-sm transition-colors duration-200 flex items-center gap-2"
                  >
                    <span className="w-1 h-1 bg-ncc-gold/40 rounded-full" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="font-heading font-bold text-base sm:text-lg mb-4 sm:mb-6 text-ncc-gold">
              Contact Us
            </h4>
            <ul className="space-y-3 sm:space-y-4">
              <li className="flex gap-3 text-sm">
                <MapPin className="w-5 h-5 text-ncc-red shrink-0 mt-0.5" />
                <span className="text-white/60">
                  MIT World Peace University,
                  <br />
                  S.No. 124, Paud Road,
                  <br />
                  Kothrud, Pune - 411038
                </span>
              </li>
              <li className="flex gap-3 text-sm">
                <Phone className="w-5 h-5 text-ncc-red shrink-0" />
                <a
                  href="tel:+912025634000"
                  className="text-white/60 hover:text-ncc-gold transition-colors"
                >
                  +91 20 2563 4000
                </a>
              </li>
              <li className="flex gap-3 text-sm">
                <Mail className="w-5 h-5 text-ncc-red shrink-0" />
                <a
                  href="mailto:ncc@mitwpu.edu.in"
                  className="text-white/60 hover:text-ncc-gold transition-colors"
                >
                  ncc@mitwpu.edu.in
                </a>
              </li>
            </ul>
          </div>

          {/* NCC Info */}
          <div>
            <h4 className="font-heading font-bold text-base sm:text-lg mb-4 sm:mb-6 text-ncc-gold">
              NCC Directorate
            </h4>
            <ul className="space-y-2 sm:space-y-3 text-sm text-white/60">
              <li>
                <strong className="text-white/80">Group HQ:</strong> NCC Group
                Headquarters, Pune
              </li>
              <li>
                <strong className="text-white/80">Directorate:</strong> NCC
                Directorate, Maharashtra
              </li>
              <li>
                <strong className="text-white/80">Wing:</strong> Senior Division
                / Senior Wing
              </li>
            </ul>
            <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
              <p className="text-xs text-ncc-gold font-medium mb-1">
                NCC Song
              </p>
              <p className="text-xs text-white/50 italic">
                &quot;Hum Sab Bharatiya Hain, Hum Sab Bharatiya Hain...&quot;
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4">
          <p className="text-white/40 text-xs text-center sm:text-left">
            © 2026 NCC Unit, MIT World Peace University, Pune. All rights reserved.
          </p>
          <p className="text-white/30 text-xs">
            Jai Hind! 🇮🇳
          </p>
        </div>
      </div>
    </footer>
  );
}
