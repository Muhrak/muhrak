"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@muhrak/schemas";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useForm, type FieldValues, type Path, type UseFormSetError } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { register as registerAccount } from "./api";
import { OrDivider, primaryButtonClass, SocialButtons } from "./auth-shell";
import { Field, FormError, FormNotice, PasswordField } from "./field";
import { applyApiError } from "./form-errors";
import { RedirectIfSignedIn } from "./guards";
import { LOGIN_PATH } from "./paths";
import { saveSession } from "./session";

export type AccountType = "individual" | "company";

const credentials = registerSchema.pick({ email: true, password: true });
const PASSWORD_HINT = "Must be at least 10 characters.";

const individualSchema = credentials.extend({
  firstName: z.string().trim().min(1, "Enter your first name").max(60),
  lastName: z.string().trim().min(1, "Enter your last name").max(60),
});

const companySchema = credentials.extend({
  companyName: z.string().trim().min(2, "Enter your company name").max(120),
  // Collected for the market test; not stored by the API yet (no company profile).
  crNumber: z.string().trim().min(1, "Enter your CR number").max(30),
});

/**
 * Buyer sign-up from Figma "Buyer – Sign up (Individual / Company) (Light)".
 * Seller sign-up follows "Seller – Sign up", in the light style. There is one
 * seller type, so the design's "Parts seller / Manufacturer" switch is left out.
 */
export function SignupForm(props: { side: "buyer"; accountType: AccountType } | { side: "seller" }) {
  const [notice, setNotice] = useState<string>();
  const seller = props.side === "seller";
  return (
    <div className="flex flex-col">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      {props.side === "buyer" ? (
        <div className="mb-5">
          <AccountTypeTabs current={props.accountType} />
        </div>
      ) : null}
      <SocialButtons onUnavailable={(provider) => setNotice(`${provider} sign-up is coming soon. Use your email for now.`)} />
      <div className="mt-5">
        <OrDivider />
      </div>
      <div className="mt-5">
        {props.side === "buyer" && props.accountType === "individual" ? (
          <IndividualForm notice={notice} />
        ) : (
          <CompanyForm notice={notice} role={props.side} />
        )}
      </div>
      <p className="mt-6 text-center text-sm leading-[normal] text-ink-tertiary">
        {seller ? "Already selling on Muhrak?" : "Already have an account?"}{" "}
        <Link href={LOGIN_PATH[props.side]} className="font-medium text-ink hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

function AccountTypeTabs({ current }: { current: AccountType }) {
  const tabs = [
    { value: "individual", label: "Individual", href: "/buyer/signup" },
    { value: "company", label: "Company", href: "/buyer/signup/company" },
  ] as const;
  return (
    <nav aria-label="Account type" className="flex gap-1 rounded-full border border-black/9 bg-black/4 p-1">
      {tabs.map((tab) => {
        const active = tab.value === current;
        return (
          <Link
            key={tab.value}
            href={tab.href}
            replace
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-[38px] flex-1 items-center justify-center rounded-full text-sm leading-[normal] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-ink text-white" : "text-ink-secondary hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function useRegister<T extends FieldValues>(setError: UseFormSetError<T>, nameField: Path<T>, fields: readonly Path<T>[]) {
  return useMutation({
    mutationFn: (input: RegisterInput) => registerAccount(input),
    // RedirectIfSignedIn moves the new user to their dashboard.
    onSuccess: saveSession,
    // The API reports name problems on `fullName`; show them on the visible name field.
    onError: (error) => applyApiError(error, setError, fields, { fullName: nameField }),
  });
}

function IndividualForm({ notice }: { notice?: string }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(individualSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });
  const mutation = useRegister(setError, "firstName", ["email", "password"]);

  return (
    <form
      noValidate
      className="flex flex-col"
      onSubmit={handleSubmit(({ firstName, lastName, email, password }) =>
        mutation.mutate({ role: "buyer", fullName: `${firstName} ${lastName}`, email, password }),
      )}
    >
      <div className="flex flex-col gap-[18px]">
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="firstName"
            label="First Name"
            autoComplete="given-name"
            placeholder="eg. Khalid"
            error={errors.firstName?.message}
            {...register("firstName")}
          />
          <Field
            id="lastName"
            label="Last Name"
            autoComplete="family-name"
            placeholder="eg. Al Amri"
            error={errors.lastName?.message}
            {...register("lastName")}
          />
        </div>
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
          autoComplete="new-password"
          placeholder="Enter your password"
          hint={PASSWORD_HINT}
          error={errors.password?.message}
          {...register("password")}
        />
        <FormNotice message={notice} />
        <FormError message={errors.root?.server?.message} />
      </div>
      <Button type="submit" disabled={mutation.isPending} className={cn("mt-7", primaryButtonClass)}>
        {mutation.isPending ? "Creating account…" : "Sign Up"}
      </Button>
    </form>
  );
}

function CompanyForm({ notice, role }: { notice?: string; role: "buyer" | "seller" }) {
  const seller = role === "seller";
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(companySchema),
    defaultValues: { companyName: "", crNumber: "", email: "", password: "" },
  });
  const mutation = useRegister(setError, "companyName", ["email", "password"]);

  // The email box on the seller landing page sends ?email=...; fill it in.
  useEffect(() => {
    const email = new URLSearchParams(window.location.search).get("email");
    if (email) setValue("email", email.slice(0, 254));
  }, [setValue]);

  return (
    <form
      noValidate
      className="flex flex-col"
      onSubmit={handleSubmit(({ companyName, email, password }) =>
        mutation.mutate({ role, fullName: companyName, email, password }),
      )}
    >
      <div className="flex flex-col gap-[18px]">
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="companyName"
            label="Company name"
            autoComplete="organization"
            placeholder={seller ? "eg. Al Noor Spare Parts" : "eg. Al Hadi Garage"}
            error={errors.companyName?.message}
            {...register("companyName")}
          />
          <Field
            id="crNumber"
            label="CR number"
            inputMode="numeric"
            placeholder="eg. 1234567"
            error={errors.crNumber?.message}
            {...register("crNumber")}
          />
        </div>
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder={seller ? "eg. ahmed@alnoorparts.om" : "eg. khalid@alhadigarage.om"}
          error={errors.email?.message}
          {...register("email")}
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          placeholder="Enter your password"
          hint={PASSWORD_HINT}
          error={errors.password?.message}
          {...register("password")}
        />
        <FormNotice message={notice} />
        <FormError message={errors.root?.server?.message} />
      </div>
      <Button type="submit" disabled={mutation.isPending} className={cn("mt-7", primaryButtonClass)}>
        {mutation.isPending ? "Creating account…" : "Sign Up"}
      </Button>
    </form>
  );
}
