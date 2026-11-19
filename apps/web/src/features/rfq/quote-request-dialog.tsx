"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronDown, Minus, Plus, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  GCC_COUNTRY_NAMES,
  gccCountrySchema,
  RFQ_EXPIRY_DAYS,
  RFQ_LIMITS,
  RFQ_NEEDED_BY_LABELS,
  rfqNeededBySchema,
  type BuyerRfq,
  type PartSearchResult,
} from "@/schemas";
import { applyApiError } from "@/features/auth/form-errors";
import { priceLabel } from "@/features/catalog/parts";
import { cn } from "@/lib/utils";
import { useCreateRfq } from "./api";
import { neededByLabel, quantityLabel } from "./parts";

/**
 * Quote request for ONE product of ONE seller (developer decision,
 * 15 Nov 2026). Figma "Request quote – Review v2" (249:7023) and "Request
 * quote – Sent v2" (249:8013), dark only, converted to the light buyer
 * palette. This is the text-search route, so the AI parts of the frame
 * ("Filled in by Muhrak AI", "Looks right" / "Please check" chips) are left
 * out; the fields are plain inputs prefilled from the product. Added from
 * the Day 9 plan: delivery city and country, and a note. "Go to messenger"
 * opens the request's chat (Day 10).
 *
 * The browser makes a request key when the dialog opens; sending the form
 * twice returns the first request (no duplicate for the seller).
 */

const focus = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const fieldClass = cn(
  "w-full min-w-0 rounded-[12px] border border-black/10 bg-black/[0.025] px-4 py-[14px] text-base leading-[normal] text-ink placeholder:text-ink-placeholder aria-invalid:border-destructive",
  focus,
);

const formSchema = z.object({
  partName: z.string().trim().min(2, "Describe the part in a few words").max(120),
  partNumber: z.string().trim().max(40),
  fitment: z.string().trim().max(100),
  quantity: z.number({ error: "Enter a quantity" }).int("Whole numbers only").min(1, "At least 1").max(RFQ_LIMITS.maxQuantity, "Too many"),
  neededBy: rfqNeededBySchema,
  deliveryCountry: gccCountrySchema,
  deliveryCity: z.string().trim().min(2, "Enter the city to deliver to").max(60),
  note: z.string().trim().max(1000, "Keep the note under 1,000 characters"),
  checked: z.literal(true, { error: "Tick the box to confirm the details" }),
});
type FormValues = z.infer<typeof formSchema>;
type FormInput = z.input<typeof formSchema>;

const FIELDS = ["partName", "partNumber", "fitment", "quantity", "neededBy", "deliveryCountry", "deliveryCity", "note"] as const;

/**
 * The product a quote is asked for: only what the form shows and sends. A search result fits,
 * and so does a product card on a seller's page (19 Nov 2026).
 */
export type QuoteTarget = Pick<
  PartSearchResult,
  "productId" | "name" | "partNumber" | "fitment" | "photoUrl" | "price" | "seller" | "availability" | "stockQuantity" | "leadTimeDays"
>;

/** The buyer's own photos from Muhrak AI (up to 4), offered for sharing with this seller. */
export interface QuotePhoto {
  identificationId: string;
  previewUrls: string[];
}

export function QuoteRequestDialog({ result, photo, onClose }: { result: QuoteTarget; photo?: QuotePhoto; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sent, setSent] = useState<BuyerRfq | null>(null);

  // No close() on unmount: that fires "close" -> onClose, which would undo a
  // navigation made from inside the dialog ("Go to messenger"). Leaving the
  // page removes the dialog, which takes it out of the top layer.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Click on the scrim (outside the card) closes, like Escape.
        if (event.target === ref.current) ref.current?.close();
      }}
      aria-label={sent ? "Request sent" : "Request a quote"}
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[640px] overflow-y-auto rounded-[24px] border border-black/8 bg-white p-0 text-ink shadow-[0_30px_80px_rgba(10,11,18,0.18)] backdrop:bg-[rgba(10,11,18,0.45)] backdrop:backdrop-blur-[2px]"
    >
      {sent ? (
        <SentView rfq={sent} onClose={() => ref.current?.close()} />
      ) : (
        <FormView result={result} photo={photo} onSent={setSent} onClose={() => ref.current?.close()} />
      )}
    </dialog>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Close" className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:text-ink", focus)}>
      <X aria-hidden className="size-5" strokeWidth={1.6} />
    </button>
  );
}

function FormView({
  result,
  photo,
  onSent,
  onClose,
}: {
  result: QuoteTarget;
  photo?: QuotePhoto;
  onSent: (rfq: BuyerRfq) => void;
  onClose: () => void;
}) {
  // One key per opened form: a double click or a retry sends the same key.
  const [requestKey] = useState(() => crypto.randomUUID());
  // The buyer's photo goes to this seller only if they keep this ticked (on by default).
  const [sharePhoto, setSharePhoto] = useState(true);
  const create = useCreateRfq();
  const {
    register,
    handleSubmit,
    setValue,
    control,
    setError,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      partName: result.name.slice(0, 120),
      partNumber: result.partNumber ?? "",
      fitment: result.fitment ?? "",
      quantity: 1,
      neededBy: "one_week",
      deliveryCountry: "OM",
      deliveryCity: "",
      note: "",
      checked: false as unknown as true,
    },
  });
  const quantity = Number(useWatch({ control, name: "quantity" })) || 0;
  const checked = useWatch({ control, name: "checked" }) === true;

  async function onSubmit(values: FormValues) {
    if (create.isPending) return;
    try {
      const rfq = await create.mutateAsync({
        productId: result.productId,
        requestKey,
        partName: values.partName,
        partNumber: values.partNumber || null,
        fitment: values.fitment || null,
        quantity: values.quantity,
        neededBy: values.neededBy,
        deliveryCountry: values.deliveryCountry,
        deliveryCity: values.deliveryCity,
        note: values.note || null,
        ...(photo && sharePhoto ? { identificationId: photo.identificationId } : {}),
      });
      onSent(rfq);
    } catch (error) {
      applyApiError(error, setError, FIELDS);
    }
  }

  const step = (delta: number) => {
    const next = Math.min(RFQ_LIMITS.maxQuantity, Math.max(1, (quantity || 0) + delta));
    setValue("quantity", next, { shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5 p-5 sm:p-7">
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2 leading-[normal]">
          <p className="text-[11px] tracking-[0.06em] text-ink-secondary">QUOTE REQUEST</p>
          <h2 tabIndex={-1} autoFocus className="text-[22px] font-medium outline-none sm:text-[26px]">
            Confirm your quote request
          </h2>
        </div>
        <CloseButton onClose={onClose} />
      </div>

      {/* Figma "Seller" card: the product and who sells it. */}
      <div className="flex items-center gap-3.5 rounded-[16px] border border-black/6 bg-black/[0.03] py-3 pr-4 pl-3">
        <ProductPhoto src={result.photoUrl} className="size-[52px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
          <p className="line-clamp-2 text-[15px] font-medium break-words">{result.name}</p>
          <p className="truncate text-[13px] text-ink-tertiary">
            {result.seller.companyName} · {result.seller.city}, {result.seller.countryName}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 leading-[normal]">
          <p className="text-base font-medium whitespace-nowrap">{priceLabel(result.price)}</p>
          <p className="text-xs text-ink-tertiary">{availability(result)}</p>
        </div>
      </div>

      {photo ? (
        <label className="flex cursor-pointer items-center gap-3.5 rounded-[16px] border border-black/8 px-3.5 py-3">
          <span className="flex shrink-0 -space-x-3">
            {(photo.previewUrls.length > 0 ? photo.previewUrls : [null]).map((url, index) => (
              <span key={url ?? index} className="flex size-[52px] items-center justify-center overflow-hidden rounded-[12px] bg-[#ededf0] ring-2 ring-white">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the buyer's own photo (local preview or short-lived link)
                  <img src={url} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                ) : null}
              </span>
            ))}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[normal]">
            <span className="text-[15px] font-medium">
              Share my {photo.previewUrls.length > 1 ? `${photo.previewUrls.length} photos` : "photo"} with {result.seller.companyName}
            </span>
            <span className="text-[13px] text-ink-tertiary">Only this seller sees them. Location and camera details are removed.</span>
          </span>
          <input
            type="checkbox"
            checked={sharePhoto}
            onChange={(event) => setSharePhoto(event.target.checked)}
            className="size-5 shrink-0 accent-ink"
          />
        </label>
      ) : null}

      <p className="text-sm leading-[normal] text-ink-secondary">Check the details. The seller quotes on exactly what you send.</p>

      <div className="flex flex-col gap-[18px]">
        <Field id="rfq-part" label="Part" error={errors.partName?.message}>
          <input id="rfq-part" maxLength={120} aria-invalid={Boolean(errors.partName)} className={fieldClass} {...register("partName")} />
        </Field>
        <div className="flex flex-col gap-[18px] sm:flex-row sm:gap-4">
          <Field id="rfq-part-number" label="Part number" optional error={errors.partNumber?.message}>
            <input id="rfq-part-number" maxLength={40} placeholder="e.g. 15-FB-02" aria-invalid={Boolean(errors.partNumber)} className={fieldClass} {...register("partNumber")} />
          </Field>
          <Field id="rfq-fits" label="Fits" optional error={errors.fitment?.message}>
            <input id="rfq-fits" maxLength={100} placeholder="Machine, e.g. Kobelco SK380" aria-invalid={Boolean(errors.fitment)} className={fieldClass} {...register("fitment")} />
          </Field>
        </div>
      </div>

      {/* Figma "Order details": Quantity stepper and Needed by. */}
      <div className="flex flex-col gap-[18px] sm:flex-row sm:gap-4">
        <Field id="rfq-quantity" label="Quantity" error={errors.quantity?.message}>
          <div className={cn("flex items-center rounded-[12px] border border-black/10 bg-black/[0.025]", errors.quantity && "border-destructive")}>
            <button type="button" aria-label="One less" onClick={() => step(-1)} disabled={quantity <= 1} className={cn("flex h-[50px] w-12 items-center justify-center rounded-l-[12px] text-ink-tertiary hover:text-ink disabled:opacity-40", focus)}>
              <Minus aria-hidden className="size-4" />
            </button>
            <input
              id="rfq-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={RFQ_LIMITS.maxQuantity}
              aria-invalid={Boolean(errors.quantity)}
              className={cn("h-[50px] min-w-0 flex-1 bg-transparent text-center text-base text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none", focus)}
              {...register("quantity", { valueAsNumber: true })}
            />
            <button type="button" aria-label="One more" onClick={() => step(1)} className={cn("flex h-[50px] w-12 items-center justify-center rounded-r-[12px] text-ink-tertiary hover:text-ink", focus)}>
              <Plus aria-hidden className="size-4" />
            </button>
          </div>
        </Field>
        <Field id="rfq-needed-by" label="Needed by">
          <SelectBox id="rfq-needed-by" {...register("neededBy")}>
            {rfqNeededBySchema.options.map((value) => (
              <option key={value} value={value}>
                {RFQ_NEEDED_BY_LABELS[value]}
              </option>
            ))}
          </SelectBox>
        </Field>
      </div>

      <div className="flex flex-col gap-[18px] sm:flex-row sm:gap-4">
        <Field id="rfq-city" label="Deliver to (city)" error={errors.deliveryCity?.message}>
          <input id="rfq-city" maxLength={60} autoComplete="address-level2" placeholder="e.g. Muscat" aria-invalid={Boolean(errors.deliveryCity)} className={fieldClass} {...register("deliveryCity")} />
        </Field>
        <Field id="rfq-country" label="Country">
          <SelectBox id="rfq-country" {...register("deliveryCountry")}>
            {gccCountrySchema.options.map((code) => (
              <option key={code} value={code}>
                {GCC_COUNTRY_NAMES[code]}
              </option>
            ))}
          </SelectBox>
        </Field>
      </div>

      <Field id="rfq-note" label="Note to the seller" optional error={errors.note?.message}>
        <textarea
          id="rfq-note"
          rows={3}
          maxLength={1000}
          placeholder="Anything that helps them quote, e.g. how many machines, condition you accept"
          aria-invalid={Boolean(errors.note)}
          className={cn(fieldClass, "resize-y")}
          {...register("note")}
        />
      </Field>

      {/* Figma "Confirm" checkbox (22 px, 6 px radius). */}
      <div className="flex flex-col gap-1.5">
        <label className="flex w-fit cursor-pointer items-center gap-3">
          <input type="checkbox" className="peer sr-only" {...register("checked")} />
          <span
            aria-hidden
            className={cn(
              "flex size-[22px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px] peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
              checked ? "border-ink bg-ink text-white" : "border-[#9a9ca8] bg-white",
            )}
          >
            {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
          </span>
          <span className="text-[15px] leading-[normal] text-ink-secondary">I’ve checked these details are correct</span>
        </label>
        {errors.checked ? <p className="text-[13px] text-destructive">{errors.checked.message}</p> : null}
      </div>

      {errors.root?.server ? (
        <p role="alert" className="rounded-[12px] bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {errors.root.server.message}
        </p>
      ) : null}

      <div className="h-px w-full bg-black/8" />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-[13px] leading-[normal] text-ink-tertiary">Quote requests are free. You only pay if you order.</p>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={cn("flex-1 rounded-full border border-black/25 px-[18px] py-[14px] text-[15px] leading-[normal] font-medium text-ink-secondary hover:bg-black/4 sm:flex-none", focus)}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!checked || create.isPending}
            className={cn(
              "flex-1 rounded-full px-6 py-[14px] text-[15px] leading-[normal] font-medium whitespace-nowrap sm:flex-none",
              checked ? "bg-ink text-white hover:opacity-90" : "bg-black/6 text-ink-placeholder",
              focus,
            )}
          >
            {create.isPending ? "Sending…" : "Submit request"}
          </button>
        </div>
      </div>
    </form>
  );
}

function SentView({ rfq, onClose }: { rfq: BuyerRfq; onClose: () => void }) {
  const rows: { label: string; value: string }[] = [
    { label: "Part", value: rfq.partName },
    ...(rfq.partNumber ? [{ label: "Part number", value: rfq.partNumber }] : []),
    ...(rfq.fitment ? [{ label: "Fits", value: rfq.fitment }] : []),
    { label: "Quantity", value: quantityLabel(rfq.quantity, rfq.unit) },
    { label: "Needed by", value: neededByLabel(rfq.neededBy) },
    { label: "Deliver to", value: `${rfq.deliveryCity}, ${rfq.deliveryCountryName}` },
  ];
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-7">
      <div className="flex justify-end">
        <CloseButton onClose={onClose} />
      </div>
      <div className="flex flex-col items-center gap-3.5 text-center leading-[normal]">
        <Image src="/landing/sparkle.svg" alt="" width={18} height={18} />
        <span className="h-1" />
        <h2 tabIndex={-1} autoFocus className="text-[24px] font-medium outline-none sm:text-[28px]">
          Request sent to {rfq.seller.companyName}
        </h2>
        <p className="max-w-[480px] text-[15px] text-ink-tertiary">
          They’ll reply with a price and delivery time in your Muhrak account. Your request {rfq.reference} closes by itself after {RFQ_EXPIRY_DAYS} days
          without a reply.
        </p>
        <span className="h-1.5" />
      </div>
      <dl className="flex flex-col rounded-[16px] bg-black/[0.03] px-5 py-1.5">
        {rows.map((row, index) => (
          <div key={row.label} className={cn("flex items-center gap-3 py-3 leading-[normal]", index > 0 && "border-t border-black/8")}>
            <dt className="w-[100px] shrink-0 text-sm text-ink-tertiary sm:w-[120px]">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-[15px] font-medium break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onClose} className={cn("flex-1 rounded-full border border-black/40 py-[15px] text-[15px] leading-[normal] font-medium hover:bg-black/4", focus)}>
          Back to results
        </button>
        <Link href={`/buyer/messages?rfq=${rfq.id}`} className={cn("flex flex-1 justify-center rounded-full bg-ink py-[15px] text-[15px] leading-[normal] font-medium text-white hover:opacity-90", focus)}>
          Go to messenger
        </Link>
      </div>
    </div>
  );
}

function Field({ id, label, optional, error, children }: { id: string; label: string; optional?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm leading-[normal] font-medium">
        {label}
        {optional ? <span className="font-normal text-ink-tertiary">Optional</span> : null}
      </label>
      {children}
      {error ? <p className="text-[13px] leading-[normal] text-destructive">{error}</p> : null}
    </div>
  );
}

function SelectBox({ id, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select id={id} className={cn(fieldClass, "appearance-none pr-11")} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-[18px] -translate-y-1/2 text-ink-tertiary" />
    </div>
  );
}

export function ProductPhoto({ src, className }: { src: string | null; className: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-black/6 bg-linear-to-b from-white to-[#f1f1f5]", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- public product photo, sized by CSS
        <img src={src} alt="" loading="lazy" className="size-full object-contain" />
      ) : null}
    </span>
  );
}

/** "In stock", "2–3 days" (Figma), "Out of stock", or "On order · 3 days". */
export function availability(result: Pick<PartSearchResult, "availability" | "leadTimeDays" | "stockQuantity">): string {
  if (result.availability === "on_order") return result.leadTimeDays ? `On order · ${result.leadTimeDays} ${result.leadTimeDays === 1 ? "day" : "days"}` : "On order";
  if (result.stockQuantity === 0) return "Out of stock";
  return "In stock";
}
