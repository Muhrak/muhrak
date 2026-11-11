import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { SignupForm } from "@/features/auth/signup-form";

export const metadata: Metadata = { title: "Create account · Muhrak" };

export default function SignupPage() {
  return (
    <AuthShell
      panelTitle="Get Started with Us"
      panelDescription="Complete these easy steps to start finding parts on Muhrak."
      steps={["Sign up your account", "Add your vehicles", "Find your first part"]}
      title="Sign Up Account"
      description="Enter your details to create your Muhrak account."
    >
      <SignupForm accountType="individual" />
    </AuthShell>
  );
}
