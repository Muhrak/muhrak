import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { SignupForm } from "@/features/auth/signup-form";

export const metadata: Metadata = { title: "Create company account · Muhrak" };

export default function CompanySignupPage() {
  return (
    <AuthShell
      panelTitle="Get Started with Us"
      panelDescription="Complete these easy steps to start finding parts on Muhrak."
      steps={["Sign up your account", "Add your company details", "Find your first part"]}
      title="Sign Up Account"
      description="Enter your company details to create a business account."
    >
      <SignupForm accountType="company" />
    </AuthShell>
  );
}
