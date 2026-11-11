"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, resetPasswordSchema } from "@muhrak/schemas";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { forgotPassword, resetPassword } from "./api";
import { primaryButtonClass } from "./auth-shell";
import { Field, FormError, PasswordField } from "./field";
import { applyApiError } from "./form-errors";
import { LOGIN_PATH, RESET_PATH, type PortalSide } from "./paths";

/** Step 1: ask for the email. The answer is the same whether or not the account exists. */
export function RequestResetForm({ side }: { side: PortalSide }) {
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const mutation = useMutation({
    mutationFn: forgotPassword,
    onError: (error) => applyApiError(error, setError, ["email"]),
  });

  if (mutation.isSuccess) {
    return (
      <Done
        message={`If an account exists for ${getValues("email")}, we have sent it a link to choose a new password. The link expires in 30 minutes. Check your spam folder if it does not arrive.`}
        action={{ href: LOGIN_PATH[side], label: "Back to log in" }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate className="flex flex-col">
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
        {mutation.isPending ? "Sending link…" : "Send reset link"}
      </Button>
      <BackToLogin side={side} />
    </form>
  );
}

const newPasswordSchema = z
  .object({ password: resetPasswordSchema.shape.password, confirm: z.string() })
  .refine((values) => values.password === values.confirm, { message: "Passwords do not match", path: ["confirm"] });

/** Step 2: the user opened the link from the email. */
export function ChooseNewPasswordForm({ side, token }: { side: PortalSide; token: string }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: "", confirm: "" } });
  const mutation = useMutation({
    mutationFn: (password: string) => resetPassword({ token, password }),
    onError: (error) => applyApiError(error, setError, ["password"]),
  });

  if (mutation.isSuccess) {
    return (
      <Done
        message="Your password has been changed and you have been signed out on all devices. Log in with your new password."
        action={{ href: LOGIN_PATH[side], label: "Log in" }}
      />
    );
  }

  const linkProblem = mutation.error && errors.root?.server;
  return (
    <form onSubmit={handleSubmit(({ password }) => mutation.mutate(password))} noValidate className="flex flex-col">
      <div className="flex flex-col gap-[18px]">
        <PasswordField
          id="password"
          label="New password"
          autoComplete="new-password"
          placeholder="Enter a new password"
          hint="Must be at least 10 characters."
          error={errors.password?.message}
          {...register("password")}
        />
        <PasswordField
          id="confirm"
          label="Confirm new password"
          autoComplete="new-password"
          placeholder="Enter it again"
          error={errors.confirm?.message}
          {...register("confirm")}
        />
        <FormError message={errors.root?.server?.message} />
        {linkProblem ? (
          <Link href={RESET_PATH[side]} className="text-sm font-medium text-ink hover:underline">
            Request a new link
          </Link>
        ) : null}
      </div>
      <Button type="submit" disabled={mutation.isPending} className={cn("mt-7", primaryButtonClass)}>
        {mutation.isPending ? "Saving…" : "Save new password"}
      </Button>
      <BackToLogin side={side} />
    </form>
  );
}

function BackToLogin({ side }: { side: PortalSide }) {
  return (
    <p className="mt-6 text-center text-sm leading-[normal] text-ink-tertiary">
      Remembered it?{" "}
      <Link href={LOGIN_PATH[side]} className="font-medium text-ink hover:underline">
        Log in
      </Link>
    </p>
  );
}

function Done({ message, action }: { message: string; action: { href: string; label: string } }) {
  return (
    <div className="flex flex-col">
      <p role="status" className="rounded-[12px] bg-black/4 px-4 py-3.5 text-sm leading-normal text-ink-secondary">
        {message}
      </p>
      <Link href={action.href} className={cn("mt-7", primaryButtonClass)}>
        {action.label}
      </Link>
    </div>
  );
}
