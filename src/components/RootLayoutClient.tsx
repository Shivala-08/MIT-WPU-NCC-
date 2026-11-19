"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ReactNode } from "react";
import type { Role } from "@/lib/roles";

interface RootLayoutClientProps {
  children: ReactNode;
  role: Role | null;
}

export default function RootLayoutClient({
  children,
  role,
}: RootLayoutClientProps) {
  const pathname = usePathname();

  const isStaffArea =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/officer") ||
    pathname.startsWith("/dashboard");

  return (
    <>
      {!isStaffArea && <Navbar role={role} />}
      <main className="min-h-screen">{children}</main>
      {!isStaffArea && <Footer />}
    </>
  );
}
