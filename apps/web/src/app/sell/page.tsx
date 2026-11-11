import type { Metadata } from "next";
import { SellerLandingPage } from "@/components/landing/seller-landing-page";

export const metadata: Metadata = {
  title: "Sell on Muhrak · Spare parts marketplace for the GCC",
  description: "Grow your parts business across the Gulf. Get quote requests from workshops, fleets and contractors with one free seller account.",
};

/** Seller landing page, Figma "Seller – Landing" (light). Sellers land here after logging in. */
export default function SellPage() {
  return <SellerLandingPage />;
}
