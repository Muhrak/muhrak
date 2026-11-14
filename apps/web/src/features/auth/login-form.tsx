"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EMAIL_NOT_VERIFIED, loginSchema, type LoginInput } from "@/schemas";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { login } from "./api";
import { OrDivider, primaryButtonClass, SocialButtons } from "./auth-shell";
import { Field, FormError, FormNotice, PasswordField } from "./field";
import { applyApiError } from "./form-errors";
import { SignedOutOnly } from "./guards";
import { RESET_PATH, SIGNUP_PATH, type PortalSide } from "./paths";
import { saveSession } from "./session";
import { ResendVerificationButton } from "./verify-email";

const FIELDS = ["email", "password"] as const;

/** The form collects email and password; the side comes from the page. */
const formSchema = loginSchema.omit({ role: true });

/**
 * Login for one side. STRICT RULE: buyer and seller are separate; the API
 * refuses an account from the other side, and the session is stored only
 * on this side. After login, SignedOutOnly sends the user on.
 */
export function LoginForm({ side }: { side: PortalSide }) {
  return (
    <SignedOutOnly side={side}>
      <LoginFormBody side={side} />
    </SignedOutOnly>
  );
}

/**
 * The form and its state live INSIDE SignedOutOnly on purpose: Next.js keeps
 * visited pages alive in the background, so state held above the gate
 * survived sign-out (button stuck on "Logging in…", email and password
 * still filled in). Inside, every sign-in or sign-out remounts a fresh,
 * empty form.
 */
function LoginFormBody({ side }: { side: PortalSide }) {
  const [notice, setNotice] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (input: Omit<LoginInput, "role">) => login({ ...input, role: side }),
    onSuccess: (session) => saveSession(side, session),
    onError: (error) => applyApiError(error, setError, FIELDS),
  });
  // Right password, email not verified yet: offer a new link for that address.
  const unverifiedEmail =
    mutation.error instanceof ApiError && mutation.error.code === EMAIL_NOT_VERIFIED ? mutation.variables?.email : undefined;

  return (
    <div className="flex flex-col">
      <SocialButtons onUnavailable={(provider) => setNotice(`${provider} sign-in is coming soon. Use your email for now.`)} />
      <div className="mt-5">
        <OrDivider />
      </div>

      <form method="post" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate className="mt-5 flex flex-col">
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
          <PasswordField
            id="password"
            label="Password"
            autoComplete="current-password"
            placeholder="Enter your password"
            error={errors.password?.message}
            footer={
              <Link
                href={RESET_PATH[side]}
                className="justify-self-end rounded-sm text-[13px] leading-[normal] font-medium text-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Forgot password?
              </Link>
            }
            {...register("password")}
          />
          <FormNotice message={notice} />
          <FormError message={errors.root?.server?.message} />
          {unverifiedEmail ? <ResendVerificationButton email={unverifiedEmail} /> : null}
        </div>

        <Button type="submit" disabled={mutation.isPending || mutation.isSuccess} className={`mt-7 ${primaryButtonClass}`}>
          {mutation.isPending || mutation.isSuccess ? "Logging in…" : "Log In"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm leading-[normal] text-ink-tertiary">
        {side === "seller" ? "New to selling on Muhrak?" : "Don’t have an account?"}{" "}
        <Link href={SIGNUP_PATH[side]} className="font-medium text-ink hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
