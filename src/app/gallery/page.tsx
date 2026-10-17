import { Metadata } from "next";
import { getImageData } from "@/lib/images";
import GalleryClient from "./GalleryClient";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Photo gallery of NCC MIT WPU events, treks, camps, and activities.",
};

export default function GalleryPage() {
  const trekImages = getImageData("/images/trek", "Trek");
  const bloodImages = getImageData("/images/blood-donation", "Blood Donation");
  const logoImages = getImageData("/images/logo", "General");

  const allImages = [...trekImages, ...bloodImages, ...logoImages];

  return (
    <GalleryClient
      allImages={allImages}
      trekImages={trekImages}
      bloodImages={bloodImages}
    />
  );
}
