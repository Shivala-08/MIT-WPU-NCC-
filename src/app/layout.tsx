import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://ncc.mitwpu.edu.in"),
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
  authors: [{ name: "NCC MIT WPU" }],
  creator: "NCC MIT WPU",
  publisher: "NCC MIT WPU",
  openGraph: {
    title: "NCC MIT WPU | Unity and Discipline",
    description:
      "National Cadet Corps unit at MIT World Peace University, Pune",
    type: "website",
    locale: "en_IN",
    url: "https://ncc.mitwpu.edu.in",
    siteName: "NCC MIT WPU",
    images: [
      {
        url: "/images/logo/ncc-logo.png",
        width: 1200,
        height: 630,
        alt: "NCC MIT WPU Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NCC MIT WPU | Unity and Discipline",
    description:
      "National Cadet Corps unit at MIT World Peace University, Pune",
    images: ["/images/logo/ncc-logo.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icon.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0a1628",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="canonical" href="https://ncc.mitwpu.edu.in" />
        <meta name="geo.placename" content="Pune, Maharashtra, India" />
        <meta name="geo.region" content="IN-MH" />
        <meta name="ICBM" content="18.5175, 73.8124" />
      </head>
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
