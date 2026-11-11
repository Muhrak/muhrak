import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Log in · Muhrak" };

export default function LoginPage() {
  return (
    <AuthShell
      panelTitle="Welcome Back"
      panelDescription="Log in to track your quotes, orders and messages on Muhrak."
      title="Log In Account"
      description="Enter your email and password to continue."
    >
      <LoginForm />
    </AuthShell>
  );
}
