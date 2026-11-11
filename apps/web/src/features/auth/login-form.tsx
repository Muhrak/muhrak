"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@muhrak/schemas";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { login } from "./api";
import { OrDivider, primaryButtonClass, SocialButtons } from "./auth-shell";
import { Field, FormError, FormNotice, PasswordField } from "./field";
import { applyApiError } from "./form-errors";
import { saveSession } from "./session";

const FIELDS = ["email", "password"] as const;

export function LoginForm() {
  const router = useRouter();
  const [notice, setNotice] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (auth) => {
      saveSession(auth);
      router.push("/account");
    },
    onError: (error) => applyApiError(error, setError, FIELDS),
  });

  return (
    <div className="flex flex-col">
      <SocialButtons onUnavailable={(provider) => setNotice(`${provider} sign-in is coming soon. Use your email for now.`)} />
      <div className="mt-5">
        <OrDivider />
      </div>

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate className="mt-5 flex flex-col">
        <div className="flex flex-col gap-[18px]">
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="eg. khalid@email.com"
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
              <button
                type="button"
                onClick={() => setNotice("Password reset is coming soon. Contact support if you are locked out.")}
                className="justify-self-end rounded-sm text-[13px] leading-[normal] font-medium text-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Forgot password?
              </button>
            }
            {...register("password")}
          />
          <FormNotice message={notice} />
          <FormError message={errors.root?.server?.message} />
        </div>

        <Button type="submit" disabled={mutation.isPending} className={`mt-7 ${primaryButtonClass}`}>
          {mutation.isPending ? "Logging in…" : "Log In"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm leading-[normal] text-ink-tertiary">
        Don’t have an account?{" "}
        <Link href="/buyer/signup" className="font-medium text-ink hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
