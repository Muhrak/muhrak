import type { Metadata } from "next";
import { Albert_Sans, Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { MaintenanceOverlay, SITE_CONTENT_ID } from "@/features/maintenance/gate";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Buyer and seller centres (Figma uses Albert Sans 300 to 800, plus 800 italic for "Buyer/Seller Centre"). */
const albertSans = Albert_Sans({
  variable: "--font-albert-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Muhrak",
  description: "Find heavy equipment and vehicle spare parts across the GCC.",
};

// Light theme first (developer decision, 11 Nov 2026).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${albertSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {/* `contents`: no box of its own, so page layouts are unchanged. */}
          <div id={SITE_CONTENT_ID} className="contents">
            {children}
          </div>
          {/* Maintenance page / warning bar; the API enforces maintenance itself. */}
          <Suspense fallback={null}>
            <MaintenanceOverlay />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
