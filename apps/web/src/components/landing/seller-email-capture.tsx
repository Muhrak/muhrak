"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { SIGNUP_PATH } from "@/features/auth/paths";
import { cn } from "@/lib/utils";

/**
 * Figma "Seller – Landing" › Hero › Email capture (light): a frosted pill
 * with the email field and "Start selling now". Submitting opens seller
 * sign-up with the email filled in.
 */
export function SellerEmailCapture({ className }: { className?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const id = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = email.trim();
    router.push(value ? `${SIGNUP_PATH.seller}?email=${encodeURIComponent(value)}` : SIGNUP_PATH.seller);
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "flex w-full max-w-[475px] items-center rounded-full border border-black/12 bg-white/60 py-[5px] pr-[5px] pl-[23px] backdrop-blur-[15px] focus-within:ring-3 focus-within:ring-ring/40",
        className,
      )}
    >
      <label htmlFor={id} className="sr-only">
        Business email
      </label>
      <input
        id={id}
        type="email"
        autoComplete="email"
        placeholder="Enter your business email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="h-[46px] min-w-0 flex-1 bg-transparent text-[15px] leading-[1.3] text-ink outline-none placeholder:text-ink-placeholder"
      />
      <button
        type="submit"
        className="flex h-[46px] shrink-0 items-center justify-center rounded-full bg-ink px-[26px] text-sm leading-[1.3] font-medium whitespace-nowrap text-white outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Start selling now
      </button>
    </form>
  );
}
