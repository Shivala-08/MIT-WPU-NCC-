"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ReactNode } from "react";

interface RootLayoutClientProps {
  children: ReactNode;
}

export default function RootLayoutClient({ children }: RootLayoutClientProps) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const isOfficer = pathname.startsWith("/officer");
  const isDashboard = pathname.startsWith("/dashboard");

  const showNavbar = !pathname.startsWith("/admin") && !pathname.startsWith("/officer") && !pathname.startsWith("/dashboard");
  const showFooter = !pathname.startsWith("/admin") && !pathname.startsWith("/officer") && !pathname.startsWith("/dashboard");

  return (
    <>
      {showNavbar && <Navbar />}
      <main className="min-h-screen">{children}</main>
      {showFooter && <Footer />}
    </>
  );
}