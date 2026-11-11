import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Muhrak · Find any spare part in the GCC",
  description: "Snap a photo of a spare part, get it identified by Muhrak AI, and compare quotes from verified sellers across the GCC.",
};

/** Buyer landing page, Figma "Buyer – Landing v2 (Light)". */
export default function Home() {
  return <LandingPage />;
}
