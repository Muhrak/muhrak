"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@muhrak/schemas";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { register as registerAccount } from "./api";
import { Field, FormError } from "./field";
import { applyApiError } from "./form-errors";
import { saveSession } from "./session";

const FIELDS = ["email", "password", "fullName", "role"] as const;

const ROLE_OPTIONS = [
  { value: "buyer", title: "I want to buy parts", description: "Find parts by photo and get quotes from sellers." },
  { value: "seller", title: "I want to sell parts", description: "Receive quote requests and reply with prices." },
] as const;

export function SignupForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: "buyer" as const, fullName: "", email: "", password: "" },
  });
  const selectedRole = useWatch({ control, name: "role" });

  const mutation = useMutation({
    mutationFn: (input: RegisterInput) => registerAccount(input),
    onSuccess: (auth) => {
      saveSession(auth);
      router.push("/account");
    },
    onError: (error) => applyApiError(error, setError, FIELDS),
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate className="grid gap-5">
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Account type</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "cursor-pointer rounded-xl border p-4 transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                selectedRole === option.value ? "border-primary bg-muted/40" : "border-border",
              )}
            >
              <input type="radio" value={option.value} className="sr-only" {...register("role")} />
              <span className="block text-sm font-medium">{option.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
            </label>
          ))}
        </div>
        {errors.role?.message ? <p className="text-sm text-destructive">{errors.role.message}</p> : null}
      </fieldset>

      <Field id="fullName" label="Full name" autoComplete="name" error={errors.fullName?.message} {...register("fullName")} />
      <Field id="email" label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        error={errors.password?.message}
        {...register("password")}
      />

      <FormError message={errors.root?.server?.message} />

      <Button type="submit" size="lg" className="h-10" disabled={mutation.isPending}>
        {mutation.isPending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </form>
  );
}
