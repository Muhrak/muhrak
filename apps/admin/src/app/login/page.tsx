import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Log in · Muhrak Admin Console" };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-sidebar-bg px-4 py-10">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
