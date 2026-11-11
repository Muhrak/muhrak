import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { SignupForm } from "@/features/auth/signup-form";

export const metadata: Metadata = { title: "Create seller account · Muhrak" };

/** Figma "Seller – Sign up (Parts seller)", in the light auth style. */
export default function SellerSignupPage() {
  return (
    <AuthShell
      side="seller"
      panelTitle="Start Selling with Us"
      panelDescription="Complete these easy steps to start receiving quote requests on Muhrak."
      steps={["Sign up your account", "Add your products", "Answer quote requests"]}
      title="Create Seller Account"
      description="Enter your store details to start receiving quote requests."
    >
      <SignupForm side="seller" />
    </AuthShell>
  );
}
