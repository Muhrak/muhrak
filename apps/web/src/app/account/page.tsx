import type { Metadata } from "next";
import { AccountSummary } from "@/features/auth/account-summary";

export const metadata: Metadata = { title: "Your account · Muhrak" };

/** Temporary landing page after sign-in. Day 2 replaces it with buyer and seller dashboards. */
export default function AccountPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <AccountSummary />
    </main>
  );
}
