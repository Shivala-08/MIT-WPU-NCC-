import { Metadata } from "next";
import ContactClient from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact Us | NCC MIT WPU",
  description:
    "Reach out to the National Cadet Corps unit at MIT World Peace University, Pune. Get in touch with officers, submit inquiries, and find campus directions.",
};

export default function ContactPage() {
  return <ContactClient />;
}
