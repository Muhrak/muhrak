import type { Metadata } from "next";
import { Suspense } from "react";
import { GoToHome } from "@/features/auth/go-to-home";

export const metadata: Metadata = { title: "Your account · Muhrak" };

/** Old Day 1 landing page. Sends the user to their dashboard, or to login. */
export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <GoToHome />
    </Suspense>
  );
}
