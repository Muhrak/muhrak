import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailPage } from "@/features/auth/verify-email-page";

export const metadata: Metadata = { title: "Verify email · Muhrak" };

export default function Page({ searchParams }: PageProps<"/seller/verify-email">) {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPage side="seller" searchParams={searchParams} />
    </Suspense>
  );
}
