"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  ChevronDown,
  Shield,
  LogOut,
  LayoutDashboard,
  User,
} from "lucide-react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/events", label: "Events" },
  { href: "/gallery", label: "Gallery" },
  { href: "/activities", label: "Activities" },
  { href: "/study-materials", label: "Study Material" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-ncc-dark-blue/95 backdrop-blur-xl shadow-2xl shadow-black/20 py-2"
          : "bg-transparent py-4"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden border-2 border-ncc-gold/60 group-hover:border-ncc-gold transition-colors">
              <Image
                src="/images/logo/ncc-logo.png"
                alt="NCC MIT WPU Logo"
                fill
                className="object-cover"
                priority
                unoptimized
              />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-white font-heading font-bold text-lg leading-tight">
                NCC MIT WPU
              </h1>
              <p className="text-ncc-gold text-xs font-medium tracking-wider">
                Unity and Discipline
              </p>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                  pathname === link.href
                    ? "text-ncc-gold"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
              >
                {link.label}
                {pathname === link.href && (
                  <motion.div
                    layoutId="navbar-indicator"
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-ncc-gold rounded-full"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </Link>
            ))}
          </nav>

          {/* Auth Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            {session ? (
              <div className="relative group">
                <button className="flex items-center gap-2 px-4 py-2 text-white/90 hover:text-white text-sm font-medium rounded-lg hover:bg-white/10 transition-all">
                  <User className="w-4 h-4" />
                  {session.user.name}
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute right-0 top-full mt-2 w-48 bg-ncc-dark-blue/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className="p-2">
                    {session.user.role === "ADMIN" ? (
                      <Link
                        href="/admin"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <Shield className="w-4 h-4" />
                        Admin Panel
                      </Link>
                    ) : (
                      <Link
                        href="/dashboard"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        Dashboard
                      </Link>
                    )}
                    <button
                      onClick={() => signOut()}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-white/90 hover:text-white text-sm font-medium rounded-lg hover:bg-white/10 transition-all"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-5 py-2.5 bg-ncc-red hover:bg-ncc-red-dark text-white text-sm font-semibold rounded-lg shadow-lg shadow-ncc-red/25 hover:shadow-ncc-red/40 transition-all duration-300 hover:scale-105"
                >
                  Register
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 text-white rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:hidden bg-ncc-dark-blue/98 backdrop-blur-xl border-t border-white/10"
          >
            <nav className="max-w-7xl mx-auto px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    pathname === link.href
                      ? "bg-ncc-gold/10 text-ncc-gold border-l-2 border-ncc-gold"
                      : "text-white/80 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-4 border-t border-white/10 space-y-2">
                {session ? (
                  <>
                    <Link
                      href={session.user.role === "ADMIN" ? "/admin" : "/dashboard"}
                      className="block px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg"
                    >
                      {session.user.role === "ADMIN" ? "Admin Panel" : "Dashboard"}
                    </Link>
                    <button
                      onClick={() => signOut()}
                      className="block w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 rounded-lg"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="block px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg"
                    >
                      Login
                    </Link>
                    <Link
                      href="/register"
                      className="block px-4 py-3 bg-ncc-red text-white text-sm font-semibold rounded-lg text-center"
                    >
                      Register as Cadet
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
