"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import { formatMoney, QUOTE_LIMITS, QUOTE_VAT_RATE_BP, toMinor, type Quote, type QuoteCreateInput, type SellerRfq } from "@/schemas";
import { applyApiError } from "@/features/auth/form-errors";
import { describedBy, FieldBlock, focusRing, inputClass } from "@/features/seller/parts";
import { useSellerAccount } from "@/features/seller/api";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useSendQuote } from "./api";

/**
 * Seller "Send quote" (Day 11), laid out after the developer's reference
 * quotation (refs/seller quotation .pdf): items (part number, description,
 * extra lines, quantity, rate), shipping, delivery time, validity, the
 * seller's own terms and notes. The first item is filled in from the
 * request; a revision starts from the current quotation.
 *
 * The totals here are a preview only: the API computes every amount (and
 * VAT, from the company profile) and the buyer sees the API's numbers. The
 * browser makes a form key when the dialog opens, so a double click sends
 * one quotation.
 */

const priceText = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,3})?$/, "Enter an amount such as 120.500");

const formSchema = z.object({
  items: z
    .array(
      z.object({
        partNumber: z.string().trim().max(60, "At most 60 characters"),
        description: z.string().trim().min(2, "Describe the item").max(120, "At most 120 characters"),
        details: z.string().trim().max(600, "At most 600 characters"),
        quantity: z.number({ error: "Enter a quantity" }).int("Whole numbers only").min(1, "At least 1").max(QUOTE_LIMITS.maxQuantity, "Too many"),
        unitPrice: priceText.refine((value) => /[1-9]/.test(value), "Enter a price above 0"),
      }),
    )
    .min(1, "Add at least one item")
    .max(QUOTE_LIMITS.maxItems, `At most ${QUOTE_LIMITS.maxItems} items`),
  shipping: priceText,
  deliveryDays: z.number({ error: "Enter the days" }).int("Whole days only").min(1, "At least 1 day").max(QUOTE_LIMITS.maxDeliveryDays, "At most 365 days"),
  validDays: z.number({ error: "Enter the days" }).int("Whole days only").min(QUOTE_LIMITS.minValidDays, "At least 1 day").max(QUOTE_LIMITS.maxValidDays, `At most ${QUOTE_LIMITS.maxValidDays} days`),
  terms: z.string().trim().max(1000, "Keep the terms under 1,000 characters"),
  notes: z.string().trim().max(1000, "Keep the notes under 1,000 characters"),
});
type FormValues = z.infer<typeof formSchema>;

const FIELDS = ["shipping", "deliveryDays", "validDays", "terms", "notes"] as const;
const ZERO = BigInt(0);
const HALF = BigInt(5000);
const BP = BigInt(10000);
const OMR = (minor: bigint) => formatMoney({ amountMinor: Number(minor), currency: "OMR" });

/** "438.3" as baisa, or null while the field is not a valid amount yet (preview only). */
function baisa(value: string | undefined): bigint | null {
  try {
    return value && /^\d{1,8}(\.\d{1,3})?$/.test(value.trim()) ? BigInt(toMinor(value.trim(), "OMR")) : null;
  } catch {
    return null;
  }
}

const decimal = (minor: number) => (minor / 1000).toFixed(3);

function defaults(rfq: SellerRfq, from: Quote | undefined): FormValues {
  if (from) {
    return {
      items: from.items.map((item) => ({
        partNumber: item.partNumber ?? "",
        description: item.description,
        details: item.details ?? "",
        quantity: item.quantity,
        unitPrice: decimal(item.unitPrice.amountMinor),
      })),
      shipping: decimal(from.shipping.amountMinor),
      deliveryDays: from.deliveryDays,
      validDays: from.validDays,
      terms: from.terms ?? "",
      notes: from.notes ?? "",
    };
  }
  return {
    items: [{ partNumber: rfq.partNumber ?? "", description: rfq.partName, details: "", quantity: rfq.quantity, unitPrice: "" }],
    shipping: "0",
    deliveryDays: 7,
    validDays: QUOTE_LIMITS.defaultValidDays,
    terms: "",
    notes: "",
  };
}

export function SendQuoteDialog({ rfq, revising, onClose }: { rfq: SellerRfq; revising?: Quote; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      aria-label={revising ? "Send a revised quotation" : "Send a quotation"}
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[760px] overflow-y-auto rounded-[24px] border border-black/8 bg-panel p-0 text-text-strong shadow-[0_30px_80px_rgba(10,11,18,0.18)] backdrop:bg-[rgba(10,11,18,0.45)] backdrop:backdrop-blur-[2px]"
    >
      <QuoteForm rfq={rfq} revising={revising} onDone={() => ref.current?.close()} />
    </dialog>
  );
}

function QuoteForm({ rfq, revising, onDone }: { rfq: SellerRfq; revising?: Quote; onDone: () => void }) {
  const [quoteKey] = useState(() => crypto.randomUUID());
  const send = useSendQuote();
  const toast = useToast();
  const vatRegistered = useSellerAccount().data?.profile?.vatRegistered ?? false;
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaults(rfq, revising) });
  const items = useFieldArray({ control, name: "items" });
  const watched = useWatch({ control });

  // Preview of the totals (the API computes the real ones).
  const lineAmounts = (watched.items ?? []).map((item) => {
    const unit = baisa(item?.unitPrice);
    const quantity = item?.quantity;
    return unit !== null && typeof quantity === "number" && Number.isInteger(quantity) && quantity > 0 ? unit * BigInt(quantity) : null;
  });
  const shipping = baisa(watched.shipping);
  const complete = lineAmounts.every((amount) => amount !== null) && shipping !== null;
  const subtotal = lineAmounts.reduce<bigint>((sum, amount) => sum + (amount ?? ZERO), ZERO);
  const vatBp = vatRegistered ? BigInt(QUOTE_VAT_RATE_BP) : ZERO;
  const vat = ((subtotal + (shipping ?? ZERO)) * vatBp + HALF) / BP;
  const total = subtotal + (shipping ?? ZERO) + vat;

  const onSubmit = handleSubmit((values) => {
    if (send.isPending) return;
    const input: QuoteCreateInput = {
      rfqId: rfq.id,
      quoteKey,
      items: values.items.map((item) => ({
        partNumber: item.partNumber || null,
        description: item.description,
        details: item.details || null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      shipping: values.shipping,
      deliveryDays: values.deliveryDays,
      validDays: values.validDays,
      terms: values.terms || null,
      notes: values.notes || null,
    };
    send.mutate(input, {
      onSuccess: (quote) => {
        toast.success(`Quotation ${quote.reference} sent.`, `${rfq.buyer.name} gets it in chat and by email.`);
        onDone();
      },
      onError: (error) => applyApiError(error, setError, FIELDS),
    });
  });

  const itemErrors = errors.items as (FieldErrors<FormValues["items"][number]> | undefined)[] | undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 p-5 sm:p-7">
      <header className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
          <h2 className="text-[22px] font-medium tracking-[-0.01em] text-text-strong">{revising ? "Send a revised quotation" : "Send a quotation"}</h2>
          <p className="text-sm text-text-muted">
            {rfq.reference} · {rfq.buyer.name} · Deliver to {rfq.deliveryCity}, {rfq.deliveryCountryName}
          </p>
          {revising ? <p className="text-[13px] text-text-muted">It replaces {revising.reference}; the buyer can no longer accept the old one.</p> : null}
        </div>
        <button type="button" onClick={onDone} aria-label="Close" className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text-strong", focusRing)}>
          <X aria-hidden className="size-5" />
        </button>
      </header>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium text-text-strong">Items</legend>
        {items.fields.map((field, index) => {
          const error = itemErrors?.[index];
          const id = (name: string) => `quote-item-${index}-${name}`;
          return (
            <div key={field.id} className="flex flex-col gap-3 rounded-[16px] border border-line p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-text-muted">Item {index + 1}</p>
                {items.fields.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => items.remove(index)}
                    aria-label={`Remove item ${index + 1}`}
                    className={cn("flex size-8 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-destructive", focusRing)}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                ) : null}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="sm:w-[180px]">
                  <FieldBlock id={id("pn")} label="Part number" optional error={error?.partNumber?.message}>
                    <input id={id("pn")} {...register(`items.${index}.partNumber`)} maxLength={60} placeholder="B3206050" aria-invalid={Boolean(error?.partNumber)} className={inputClass} />
                  </FieldBlock>
                </div>
                <FieldBlock id={id("desc")} label="Description" error={error?.description?.message}>
                  <input id={id("desc")} {...register(`items.${index}.description`)} maxLength={120} placeholder="Piston" aria-invalid={Boolean(error?.description)} className={inputClass} />
                </FieldBlock>
              </div>
              <FieldBlock id={id("details")} label="More lines" optional error={error?.details?.message} hint="Shown under the item, e.g. what a kit contains (one per line).">
                <textarea
                  id={id("details")}
                  {...register(`items.${index}.details`)}
                  rows={2}
                  maxLength={600}
                  aria-describedby={describedBy(id("details"), error?.details?.message, "hint")}
                  className={cn(inputClass, "h-auto min-h-[76px] py-3")}
                />
              </FieldBlock>
              <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[120px_170px_1fr]">
                <div>
                  <FieldBlock id={id("qty")} label="Quantity" error={error?.quantity?.message}>
                    <input
                      id={id("qty")}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={QUOTE_LIMITS.maxQuantity}
                      step={1}
                      {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                      aria-invalid={Boolean(error?.quantity)}
                      className={inputClass}
                    />
                  </FieldBlock>
                </div>
                <div>
                  <FieldBlock id={id("rate")} label="Rate (OMR)" error={error?.unitPrice?.message}>
                    <input id={id("rate")} {...register(`items.${index}.unitPrice`)} inputMode="decimal" placeholder="0.000" aria-invalid={Boolean(error?.unitPrice)} className={inputClass} />
                  </FieldBlock>
                </div>
                <div className="col-span-2 flex min-w-0 flex-col gap-2 leading-[normal] sm:col-span-1">
                  <span className="text-sm font-medium text-text-strong">Amount</span>
                  <span className="flex h-[52px] items-center justify-end rounded-[12px] bg-surface px-4 text-base text-text-strong tabular-nums">
                    {lineAmounts[index] != null ? OMR(lineAmounts[index]!) : "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {errors.items?.root?.message || errors.items?.message ? <p className="text-[13px] text-destructive">{errors.items?.root?.message ?? errors.items?.message}</p> : null}
        {items.fields.length < QUOTE_LIMITS.maxItems ? (
          <button
            type="button"
            onClick={() => items.append({ partNumber: "", description: "", details: "", quantity: 1, unitPrice: "" })}
            className={cn("flex w-fit items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-text-strong hover:bg-black/4", focusRing)}
          >
            <Plus aria-hidden className="size-4" />
            Add item
          </button>
        ) : null}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <FieldBlock id="quote-shipping" label="Shipping (OMR)" error={errors.shipping?.message} hint="0 for free shipping">
          <input id="quote-shipping" {...register("shipping")} inputMode="decimal" aria-invalid={Boolean(errors.shipping)} aria-describedby={describedBy("quote-shipping", errors.shipping?.message, "hint")} className={inputClass} />
        </FieldBlock>
        <FieldBlock id="quote-delivery" label="Delivery (days)" error={errors.deliveryDays?.message} hint="After payment">
          <input
            id="quote-delivery"
            type="number"
            inputMode="numeric"
            min={1}
            max={QUOTE_LIMITS.maxDeliveryDays}
            {...register("deliveryDays", { valueAsNumber: true })}
            aria-invalid={Boolean(errors.deliveryDays)}
            aria-describedby={describedBy("quote-delivery", errors.deliveryDays?.message, "hint")}
            className={inputClass}
          />
        </FieldBlock>
        <FieldBlock id="quote-valid" label="Valid for (days)" error={errors.validDays?.message} hint={`Up to ${QUOTE_LIMITS.maxValidDays} days`}>
          <input
            id="quote-valid"
            type="number"
            inputMode="numeric"
            min={QUOTE_LIMITS.minValidDays}
            max={QUOTE_LIMITS.maxValidDays}
            {...register("validDays", { valueAsNumber: true })}
            aria-invalid={Boolean(errors.validDays)}
            aria-describedby={describedBy("quote-valid", errors.validDays?.message, "hint")}
            className={inputClass}
          />
        </FieldBlock>
      </div>

      <FieldBlock id="quote-terms" label="Your terms" optional error={errors.terms?.message} hint="One per line. Muhrak adds the standard terms: validity, payment on Muhrak, delivery time and VAT.">
        <textarea
          id="quote-terms"
          {...register("terms")}
          rows={3}
          maxLength={1000}
          placeholder="Prices are ex-works Muscat"
          aria-describedby={describedBy("quote-terms", errors.terms?.message, "hint")}
          className={cn(inputClass, "h-auto min-h-[96px] py-3")}
        />
      </FieldBlock>
      <FieldBlock id="quote-notes" label="Notes to the buyer" optional error={errors.notes?.message}>
        <textarea id="quote-notes" {...register("notes")} rows={3} maxLength={1000} className={cn(inputClass, "h-auto min-h-[96px] py-3")} />
      </FieldBlock>

      <dl className="ml-auto flex w-full max-w-[360px] flex-col gap-1.5 text-sm" aria-live="polite">
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">Items</dt>
          <dd className="tabular-nums">{complete ? OMR(subtotal) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">Shipping</dt>
          <dd className="tabular-nums">{shipping === null ? "—" : shipping === ZERO ? "Free" : OMR(shipping)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">{vatRegistered ? `VAT ${QUOTE_VAT_RATE_BP / 100}%` : "VAT"}</dt>
          <dd className="tabular-nums">{vatRegistered ? (complete ? OMR(vat) : "—") : "Not charged"}</dd>
        </div>
        <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2.5 text-base">
          <dt className="font-medium">Total</dt>
          <dd className="font-semibold tabular-nums">{complete ? OMR(total) : "—"}</dd>
        </div>
        <p className="text-[12px] text-text-subtle">
          {vatRegistered ? "VAT is added because your company is VAT registered." : "No VAT: your company profile says it is not VAT registered."}
        </p>
      </dl>

      {errors.root?.server?.message ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.server.message}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onDone} className={cn("h-11 rounded-full border border-line px-5 text-[15px] font-medium text-text-strong hover:bg-black/4", focusRing)}>
          Cancel
        </button>
        <button type="submit" disabled={send.isPending} className={cn("h-11 rounded-full bg-side-accent px-6 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-60", focusRing)}>
          {send.isPending ? "Sending…" : revising ? "Send revised quotation" : "Send quotation"}
        </button>
      </div>
    </form>
  );
}
