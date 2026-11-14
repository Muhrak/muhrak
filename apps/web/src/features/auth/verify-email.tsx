"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { resendVerificationSchema } from "@/schemas";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { resendVerification, verifyEmail } from "./api";
import { primaryButtonClass } from "./auth-shell";
import { Field, FormError } from "./field";
import { applyApiError } from "./form-errors";
import { LOGIN_PATH, type PortalSide } from "./paths";

/**
 * Email verification (developer decision, 14 Nov 2026): a new account cannot
 * sign in until its email is verified. These pieces are used after sign-up,
 * on the login form and on /buyer|seller/verify-email.
 */

const statusClass = "rounded-[12px] bg-black/4 px-4 py-3.5 text-sm leading-normal text-ink-secondary";

/**
 * "Send a new link" for `email`. The API answers the same for every address,
 * so this says "if…" and never confirms that an account exists.
 */
export function ResendVerificationButton({ email, className }: { email: string; className?: string }) {
  const mutation = useMutation({ mutationFn: () => resendVerification(email) });
  if (mutation.isSuccess) {
    return (
      <p role="status" className={cn("text-[13px] leading-normal text-ink-tertiary", className)}>
        If {email} has an account that is not verified yet, a new link is on its way. Only the newest link works.
      </p>
    );
  }
  return (
    <p className={cn("text-[13px] leading-normal text-ink-tertiary", className)}>
      Didn’t get it? Check your spam folder, or{" "}
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        className="font-medium text-ink underline-offset-2 hover:underline disabled:opacity-60"
      >
        {mutation.isPending ? "sending…" : "send a new link"}
      </button>
      .{mutation.isError ? " That did not work. Please try again." : ""}
    </p>
  );
}

/** Shown instead of the sign-up form once it has been sent. */
export function CheckInbox({ email, side }: { email: string; side: PortalSide }) {
  return (
    <div className="flex flex-col">
      <p role="status" className={statusClass}>
        <span className="block font-medium text-ink">Check your inbox</span>
        We sent a link to <span className="font-medium text-ink">{email}</span>. Open it to verify your email and activate your account.
        The link expires in 24 hours.
      </p>
      <ResendVerificationButton email={email} className="mt-4" />
      <Link href={LOGIN_PATH[side]} className={cn("mt-7", primaryButtonClass)}>
        Go to log in
      </Link>
    </div>
  );
}

/**
 * The page the email link opens. Verifying takes one click (not automatic
 * on load), so mail scanners that open links cannot use them up. It does not
 * sign in: the user logs in with their password next.
 */
export function ConfirmEmailForm({ side, token }: { side: PortalSide; token: string }) {
  const mutation = useMutation({ mutationFn: () => verifyEmail(token) });

  if (mutation.isSuccess) {
    // The link belongs to one side; send the user to that side's login.
    const accountSide: PortalSide = mutation.data.role === "seller" ? "seller" : "buyer";
    return (
      <div className="flex flex-col">
        <p role="status" className={statusClass}>
          <span className="block font-medium text-ink">Email verified</span>
          Your account is active. Log in with your email and password.
        </p>
        <Link href={LOGIN_PATH[accountSide]} className={cn("mt-7", primaryButtonClass)}>
          Log in
        </Link>
      </div>
    );
  }

  const failed = mutation.error instanceof ApiError && mutation.error.status === 400;
  if (failed) {
    return (
      <div className="flex flex-col">
        <FormError message="This link is not valid or has expired. Links work once and for 24 hours. Ask for a new one below." />
        <div className="mt-6">
          <RequestVerificationForm side={side} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <p className={statusClass}>Confirm that this is your email address to activate your Muhrak account.</p>
      <FormError message={mutation.isError ? "Something went wrong. Please try again." : undefined} />
      <Button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        className={cn("mt-7", primaryButtonClass)}
      >
        {mutation.isPending ? "Verifying…" : "Verify my email"}
      </Button>
    </div>
  );
}

/** "Send me a new link" by email (the verify page without a token, or after an expired link). */
export function RequestVerificationForm({ side }: { side: PortalSide }) {
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm({ resolver: zodResolver(resendVerificationSchema), defaultValues: { email: "" } });
  const mutation = useMutation({
    mutationFn: ({ email }: { email: string }) => resendVerification(email),
    onError: (error) => applyApiError(error, setError, ["email"]),
  });

  if (mutation.isSuccess) {
    return (
      <div className="flex flex-col">
        <p role="status" className={statusClass}>
          If {getValues("email")} has an account that is not verified yet, we have sent it a new link. Check your spam folder if it
          does not arrive.
        </p>
        <Link href={LOGIN_PATH[side]} className={cn("mt-7", primaryButtonClass)}>
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form method="post" noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col">
      <div className="flex flex-col gap-[18px]">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder={side === "seller" ? "eg. ahmed@alnoorparts.om" : "eg. khalid@email.com"}
          error={errors.email?.message}
          {...register("email")}
        />
        <FormError message={errors.root?.server?.message} />
      </div>
      <Button type="submit" disabled={mutation.isPending} className={cn("mt-7", primaryButtonClass)}>
        {mutation.isPending ? "Sending link…" : "Send a new link"}
      </Button>
    </form>
  );
}
