import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordPage } from "@/features/auth/reset-password-page";

export const metadata: Metadata = { title: "Reset password · Muhrak" };

export default function Page({ searchParams }: PageProps<"/seller/reset-password">) {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPage side="seller" searchParams={searchParams} />
    </Suspense>
  );
}
