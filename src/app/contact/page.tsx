import { Metadata } from "next";
import ContactClient from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact Us | NCC MIT WPU",
  description:
    "Reach out to the National Cadet Corps unit at MIT World Peace University, Pune. Get in touch with officers, submit inquiries, and find campus directions.",
  openGraph: {
    title: "Contact NCC MIT WPU - Get in Touch",
    description: "Reach out to the NCC unit at MIT World Peace University, Pune. Contact officers and find directions.",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact NCC MIT WPU",
    description: "Get in touch with NCC MIT WPU officers and find campus directions.",
  },
};

export default function ContactPage() {
  return <ContactClient />;
}
