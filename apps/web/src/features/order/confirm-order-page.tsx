"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { deliveryAddressInputSchema, formatMoney, type Quote } from "@/schemas";
import { useQuote } from "@/features/quotation/api";
import { describedBy, FieldBlock, focusRing, inputClass } from "@/features/seller/parts";
import { WorkspacePanel } from "@/components/layout/workspace";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { startPayment, useCreateOrder, useLastDelivery } from "./api";

/**
 * Confirm order (Day 12): the buyer checks the quotation and says where to
 * deliver, then pays on the gateway's page. The amounts shown are the
 * quotation's; the server copies them again when the order is made, so
 * nothing typed here can change a price. City and country are the
 * quotation's (its shipping was priced for them).
 */

type DeliveryForm = z.input<typeof deliveryAddressInputSchema>;

export function ConfirmOrderPage() {
  const params = useSearchParams();
  const quoteId = params.get("quote") ?? "";
  const quote = useQuote("buyer", quoteId);

  return (
    <WorkspacePanel side="buyer" title="Confirm order" description="Check the quotation and where to deliver, then pay.">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!quoteId ? (
          <Missing />
        ) : quote.isPending ? (
          <Spinner label="Loading the quotation" className="h-full min-h-[240px]" />
        ) : !quote.data ? (
          <Missing />
        ) : quote.data.status !== "active" ? (
          <NotOrderable quote={quote.data} />
        ) : (
          <ConfirmForm quote={quote.data} />
        )}
      </div>
    </WorkspacePanel>
  );
}

function Missing() {
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-[15px] text-text-muted">This quotation could not be found.</p>
      <Link href="/buyer/requests" className={cn("text-sm font-medium text-text-strong underline", focusRing)}>
        Back to Inquiries & RFQs
      </Link>
    </div>
  );
}

function NotOrderable({ quote }: { quote: Quote }) {
  const message =
    quote.status === "accepted"
      ? "You already confirmed this quotation."
      : quote.status === "superseded"
        ? "The seller sent a newer quotation. Confirm the newest one instead."
        : quote.status === "withdrawn"
          ? "The seller withdrew this quotation. Ask for a new one in chat."
          : "This quotation has expired. Ask the seller in chat for a new one.";
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-[15px] text-text-body">{message}</p>
      <Link
        href={quote.status === "accepted" ? "/buyer/orders" : `/buyer/requests?id=${encodeURIComponent(quote.rfqId)}`}
        className={cn("rounded-full border border-line px-4 py-2 text-sm font-medium text-text-strong hover:bg-black/4", focusRing)}
      >
        {quote.status === "accepted" ? "Go to Orders" : "Back to the request"}
      </Link>
    </div>
  );
}

function ConfirmForm({ quote }: { quote: Quote }) {
  const router = useRouter();
  const toast = useToast();
  const last = useLastDelivery();
  const create = useCreateOrder();
  // Made when the page opens: confirming twice (double click, retry) returns the same order.
  const [orderKey] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<"idle" | "ordering" | "paying">("idle");

  const form = useForm<DeliveryForm>({
    resolver: zodResolver(deliveryAddressInputSchema),
    defaultValues: { recipientName: "", phone: "", addressLine: "", notes: "" },
  });
  const { register, handleSubmit, reset, formState } = form;
  const errors = formState.errors;

  // Fill in the last order's address once, if the buyer has not typed yet.
  useEffect(() => {
    if (last.data && !formState.isDirty) reset({ ...last.data, notes: last.data.notes ?? "" });
  }, [last.data, formState.isDirty, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setStep("ordering");
    let orderId: string;
    try {
      const delivery = deliveryAddressInputSchema.parse(values);
      orderId = (await create.mutateAsync({ quotationId: quote.id, orderKey, delivery })).id;
    } catch (error) {
      setStep("idle");
      toast.error(error instanceof ApiError ? error.message : "The order could not be confirmed. Please try again.");
      return;
    }
    setStep("paying");
    try {
      const { checkoutUrl } = await startPayment(orderId);
      window.location.assign(checkoutUrl);
    } catch (error) {
      // The order is saved; the buyer can pay from Orders (e.g. payments not switched on yet).
      toast.info(error instanceof ApiError ? error.message : "Your order is saved. You can pay it from Orders.");
      router.replace(`/buyer/orders?id=${encodeURIComponent(orderId)}`);
    }
  });

  const busy = step !== "idle";
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_minmax(320px,400px)] lg:items-start">
      <section aria-label="Deliver to" className="flex flex-col gap-4">
        <h2 className="text-[17px] font-medium text-text-strong">Deliver to</h2>
        <div className="flex flex-col gap-4 sm:flex-row">
          <FieldBlock id="recipientName" label="Recipient name" error={errors.recipientName?.message}>
            <input id="recipientName" autoComplete="name" className={inputClass} aria-invalid={Boolean(errors.recipientName)} aria-describedby={describedBy("recipientName", errors.recipientName?.message)} {...register("recipientName")} />
          </FieldBlock>
          <FieldBlock id="phone" label="Phone" error={errors.phone?.message} hint="For the courier only. The seller sees it after you pay.">
            <input id="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+968 9123 4567" className={inputClass} aria-invalid={Boolean(errors.phone)} aria-describedby={describedBy("phone", errors.phone?.message, "x")} {...register("phone")} />
          </FieldBlock>
        </div>
        <FieldBlock id="addressLine" label="Address" error={errors.addressLine?.message} hint="Building, street and area.">
          <input id="addressLine" autoComplete="street-address" className={inputClass} aria-invalid={Boolean(errors.addressLine)} aria-describedby={describedBy("addressLine", errors.addressLine?.message, "x")} {...register("addressLine")} />
        </FieldBlock>
        <FieldBlock id="city" label="City and country" hint="From the quotation: the shipping price is for this place.">
          <input id="city" readOnly value={`${quote.buyer.deliveryCity}, ${quote.buyer.deliveryCountryName}`} className={inputClass} aria-describedby="city-hint" />
        </FieldBlock>
        <FieldBlock id="notes" label="Delivery notes" optional error={errors.notes?.message}>
          <input id="notes" placeholder="Landmark, gate, best time to call" className={inputClass} aria-invalid={Boolean(errors.notes)} {...register("notes")} />
        </FieldBlock>
      </section>

      <aside aria-label="Order summary" className="flex flex-col gap-4 rounded-[20px] border border-line p-4 sm:p-5">
        <div className="flex flex-col gap-1 leading-[normal]">
          <p className="text-[17px] font-medium text-text-strong">Quotation {quote.reference}</p>
          <p className="text-[13px] text-text-muted">From {quote.seller.companyName} · delivery within {quote.deliveryDays} day{quote.deliveryDays === 1 ? "" : "s"} after payment</p>
        </div>
        <ul className="flex flex-col divide-y divide-line text-sm">
          {quote.items.map((item) => (
            <li key={item.position} className="flex justify-between gap-3 py-2">
              <span className="min-w-0 break-words text-text-strong">
                {item.quantity} × {item.partNumber ? `${item.partNumber} ` : ""}
                {item.description}
              </span>
              <span className="shrink-0 text-text-strong tabular-nums">{formatMoney(item.amount)}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Shipping</dt>
            <dd className="text-text-strong tabular-nums">{quote.shipping.amountMinor === 0 ? "Free" : formatMoney(quote.shipping)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">{quote.vatRateBp > 0 ? `VAT ${quote.vatRateBp / 100}%` : "VAT"}</dt>
            <dd className="text-text-strong tabular-nums">{quote.vatRateBp > 0 ? formatMoney(quote.vat) : "Not charged"}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2.5 text-base">
            <dt className="font-medium text-text-strong">Total</dt>
            <dd className="font-semibold text-text-strong tabular-nums">{formatMoney(quote.total)}</dd>
          </div>
        </dl>
        <button
          type="submit"
          disabled={busy}
          className={cn("flex h-12 items-center justify-center gap-2 rounded-full bg-side-accent px-6 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-60", focusRing)}
        >
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {step === "ordering" ? "Confirming…" : step === "paying" ? "Opening payment…" : `Confirm and pay ${formatMoney(quote.total)}`}
        </button>
        <p className="text-[13px] leading-[1.45] text-text-muted">
          You pay Muhrak on the payment page; your card is never stored here. Muhrak pays the seller only after you receive the parts. You have 24 hours to pay.
        </p>
      </aside>
    </form>
  );
}
