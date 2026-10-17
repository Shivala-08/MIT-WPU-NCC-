import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: {
    default: "NCC MIT WPU | Unity and Discipline",
    template: "%s | NCC MIT WPU",
  },
  description:
    "National Cadet Corps unit at MIT World Peace University, Pune. Building character, discipline, leadership, and the spirit of selfless service among cadets.",
  keywords: [
    "NCC",
    "MIT WPU",
    "MIT World Peace University",
    "National Cadet Corps",
    "Pune",
    "Cadets",
    "Military Training",
    "Unity and Discipline",
  ],
  openGraph: {
    title: "NCC MIT WPU | Unity and Discipline",
    description:
      "National Cadet Corps unit at MIT World Peace University, Pune",
    type: "website",
    locale: "en_IN",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased">
        <AuthProvider>
          <Navbar />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
