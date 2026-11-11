"use client";

import { Eye } from "lucide-react";
import Image from "next/image";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps extends ComponentProps<"input"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Rendered under the input, after the hint or error (e.g. "Forgot password?"). */
  footer?: ReactNode;
}

const inputClass =
  "h-12 rounded-[12px] border-black/10 bg-white px-4 text-sm leading-[normal] text-ink placeholder:text-ink-placeholder md:text-sm";

/** Label + input + error message, wired for screen readers. */
export function Field({ id, label, error, hint, footer, className, ...inputProps }: FieldProps) {
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} footer={footer}>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(inputClass, className)}
        {...inputProps}
      />
    </FieldFrame>
  );
}

/** Password field with the show / hide toggle from the design. */
export function PasswordField({ id, label, error, hint, footer, className, ...inputProps }: Omit<FieldProps, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} footer={footer}>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={cn(inputClass, "pr-11", className)}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute top-1/2 right-4 flex -translate-y-1/2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {visible ? (
            <Eye aria-hidden strokeWidth={1.5} className="size-[18px] text-ink-tertiary" />
          ) : (
            <Image src="/auth/eye-off.svg" alt="" width={18} height={18} />
          )}
        </button>
      </div>
    </FieldFrame>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

function FieldFrame({
  id,
  label,
  error,
  hint,
  footer,
  children,
}: Pick<FieldProps, "id" | "label" | "error" | "hint" | "footer"> & { children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id} className="leading-[normal] text-ink">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] leading-[normal] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] leading-[normal] text-ink-tertiary">
          {hint}
        </p>
      ) : null}
      {footer}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </p>
  );
}

/** Neutral one-line notice, e.g. for features that are not available yet. */
export function FormNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-[12px] bg-black/4 px-4 py-3 text-sm text-ink-secondary">
      {message}
    </p>
  );
}
