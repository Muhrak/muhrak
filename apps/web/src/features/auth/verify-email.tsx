"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { emailCodeSchema } from "@/schemas";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resendVerification, verifyEmailCode } from "./api";
import { primaryButtonClass } from "./auth-shell";
import { Field, FormError } from "./field";
import { applyApiError } from "./form-errors";
import type { PortalSide } from "./paths";
import { saveSession } from "./session";

/**
 * Email verification by code (developer decision, 14 Nov 2026): a new
 * account cannot sign in until the 6-digit code from the verification email
 * is entered. A right code signs the user in on their side; the surrounding
 * SignedOutOnly gate then sends them on, as after a normal login.
 */

const codeFormSchema = z.object({ code: emailCodeSchema });

/**
 * "Send a new code" for `email`. The API answers the same for every address,
 * so this never confirms that an account exists.
 */
function ResendCodeButton({ email }: { email: string }) {
  const mutation = useMutation({ mutationFn: () => resendVerification(email) });
  if (mutation.isSuccess) {
    return (
      <p role="status" className="text-[13px] leading-normal text-ink-tertiary">
        A new code is on its way (if one was sent less than a minute ago, use that one). Only the newest code works.
      </p>
    );
  }
  return (
    <p className="text-[13px] leading-normal text-ink-tertiary">
      Didn’t get it? Check your spam folder, or{" "}
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        className="font-medium text-ink underline-offset-2 hover:underline disabled:opacity-60"
      >
        {mutation.isPending ? "sending…" : "send a new code"}
      </button>
      .{mutation.isError ? " That did not work. Please try again." : ""}
    </p>
  );
}

/**
 * The code step: shown on sign-up after the form is sent, and on login when
 * the account's email is not verified yet (`sendOnOpen`: ask for a fresh
 * code once; the API skips it if one went out under a minute ago).
 */
export function VerifyCodeStep({ email, side, sendOnOpen = false }: { email: string; side: PortalSide; sendOnOpen?: boolean }) {
  const sent = useRef(false);
  useEffect(() => {
    if (!sendOnOpen || sent.current) return;
    sent.current = true;
    void resendVerification(email).catch(() => undefined);
  }, [sendOnOpen, email]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(codeFormSchema), defaultValues: { code: "" } });
  const mutation = useMutation({
    mutationFn: ({ code }: { code: string }) => verifyEmailCode({ email, code, role: side }),
    onSuccess: (session) => saveSession(side, session),
    onError: (error) => applyApiError(error, setError, ["code"]),
  });

  return (
    <form method="post" noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col">
      <p role="status" className="rounded-[12px] bg-black/4 px-4 py-3.5 text-sm leading-normal text-ink-secondary">
        <span className="block font-medium text-ink">Check your inbox</span>
        We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>. Enter it below to verify your email. It
        expires in 10 minutes.
      </p>
      <div className="mt-[18px] flex flex-col gap-[18px]">
        <Field
          id="code"
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          className="tracking-[0.3em]"
          error={errors.code?.message}
          {...register("code")}
        />
        <FormError message={errors.root?.server?.message} />
        <ResendCodeButton email={email} />
      </div>
      <Button type="submit" disabled={mutation.isPending || mutation.isSuccess} className={cn("mt-7", primaryButtonClass)}>
        {mutation.isPending || mutation.isSuccess ? "Verifying…" : "Verify and continue"}
      </Button>
    </form>
  );
}
