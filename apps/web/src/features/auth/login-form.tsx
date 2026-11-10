"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@muhrak/schemas";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { login } from "./api";
import { Field, FormError } from "./field";
import { applyApiError } from "./form-errors";
import { saveSession } from "./session";

const FIELDS = ["email", "password"] as const;

export function LoginForm() {
  const router = useRouter();
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
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate className="grid gap-5">
      <Field id="email" label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />

      <FormError message={errors.root?.server?.message} />

      <Button type="submit" size="lg" className="h-10" disabled={mutation.isPending}>
        {mutation.isPending ? "Logging in…" : "Log in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to Muhrak?{" "}
        <Link href="/signup" className="text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
