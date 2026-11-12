"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { login } from "./api";
import { safeNext, SignedOutOnly } from "./guards";
import { saveSession } from "./session";

const formSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter your email"),
  password: z.string().min(1, "Enter your password").max(200),
});

const inputClass =
  "h-12 w-full rounded-[12px] border border-line bg-panel px-4 text-[15px] text-text-strong outline-none placeholder:text-text-subtle focus-visible:ring-3 focus-visible:ring-brand-blue/40 aria-invalid:border-destructive";

/**
 * Admin login. The API accepts only admin accounts on this side (403 for a
 * buyer or seller), and the failed-login limits apply as everywhere else.
 * There is no sign-up and no "forgot password": admins are created and
 * reset from the command line.
 */
export function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(formSchema), defaultValues: { email: "", password: "" } });
  const mutation = useMutation({ mutationFn: login, onSuccess: saveSession });
  const serverError = mutation.error
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : "Something went wrong. Please try again."
    : undefined;

  return (
    <SignedOutOnly next={next}>
      <div className="flex w-full max-w-[420px] flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <Image src="/muhrak-logo-white.svg" alt="Muhrak" width={156} height={30} priority />
          <p className="bg-admin-gradient bg-clip-text text-sm leading-[normal] font-extrabold text-transparent italic">Admin Console</p>
        </div>
        <form
          method="post"
          noValidate
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex w-full flex-col gap-[18px] rounded-[24px] bg-panel px-6 py-7 sm:px-8"
        >
          <h1 className="text-2xl leading-[normal] font-medium tracking-[-0.01em] text-text-strong">Log in</h1>
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-text-strong">
              Email
            </label>
            <input id="email" type="email" autoComplete="username" aria-invalid={errors.email ? true : undefined} className={inputClass} {...register("email")} />
            {errors.email ? <p className="text-[13px] text-destructive">{errors.email.message}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-text-strong">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              className={inputClass}
              {...register("password")}
            />
            {errors.password ? <p className="text-[13px] text-destructive">{errors.password.message}</p> : null}
          </div>
          {serverError ? (
            <p role="alert" className="rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {serverError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={mutation.isPending || mutation.isSuccess}
            className={cn(
              "mt-2 flex h-12 items-center justify-center rounded-full bg-sidebar-bg text-[15px] font-semibold text-white outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-brand-blue/40 disabled:opacity-60",
            )}
          >
            {mutation.isPending || mutation.isSuccess ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p className="text-center text-xs text-sidebar-meta">For Muhrak staff only. Every action is recorded.</p>
      </div>
    </SignedOutOnly>
  );
}
