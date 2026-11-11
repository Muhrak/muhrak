import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Seller log in · Muhrak" };

export default function SellerLoginPage() {
  return (
    <AuthShell
      side="seller"
      panelTitle="Welcome Back"
      panelDescription="Log in to answer quote requests and manage your products and orders."
      title="Log In Seller Account"
      description="Enter your email and password to continue."
    >
      <LoginForm side="seller" />
    </AuthShell>
  );
}
