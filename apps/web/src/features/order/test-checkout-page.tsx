"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/schemas";
import { focusRing } from "@/features/seller/parts";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { completeTestPayment, useOrder } from "./api";

/**
 * The fake gateway's "checkout page" (Day 12, local and staging tests only):
 * no card, no money. The buttons ask the API to send a signed webhook
 * through the normal path, then come back to the order like a real gateway
 * would (`checking=1`). The API refuses this unless the fake gateway is on.
 */
export function TestCheckoutPage() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const orderId = params.get("order");
  const paymentId = params.get("payment");
  const order = useOrder("buyer", orderId);
  const [busy, setBusy] = useState<"succeeded" | "failed" | null>(null);

  async function finish(outcome: "succeeded" | "failed") {
    if (!paymentId || !orderId) return;
    setBusy(outcome);
    try {
      await completeTestPayment(paymentId, outcome);
      router.replace(`/buyer/orders?id=${encodeURIComponent(orderId)}&checking=1`);
    } catch (error) {
      setBusy(null);
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-108px)] items-center justify-center lg:min-h-[calc(100dvh-58px)]">
      <section className="flex w-full max-w-[440px] flex-col gap-5 rounded-[24px] bg-panel p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#fff4e5] text-[#b45309]">
            <FlaskConical aria-hidden className="size-[18px]" />
          </span>
          <div className="flex flex-col leading-[normal]">
            <h1 className="text-lg font-medium text-text-strong">Test checkout</h1>
            <p className="text-[13px] text-[#b45309]">Test gateway: no card, no money moves</p>
          </div>
        </div>
        {!orderId || !paymentId ? (
          <p className="text-sm text-destructive">This checkout link is not complete.</p>
        ) : order.isPending ? (
          <Spinner className="py-8" />
        ) : !order.data ? (
          <p className="text-sm text-destructive">This order could not be found.</p>
        ) : (
          <>
            <dl className="flex flex-col gap-1.5 rounded-[16px] bg-surface p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Order</dt>
                <dd className="text-text-strong">{order.data.reference}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Seller</dt>
                <dd className="text-text-strong">{order.data.seller.companyName}</dd>
              </div>
              <div className="flex justify-between gap-4 text-base">
                <dt className="font-medium text-text-strong">Amount</dt>
                <dd className="font-semibold text-text-strong tabular-nums">{formatMoney(order.data.total)}</dd>
              </div>
            </dl>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void finish("succeeded")}
                className={cn("flex h-12 items-center justify-center gap-2 rounded-full bg-side-accent text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-60", focusRing)}
              >
                {busy === "succeeded" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
                Pay {formatMoney(order.data.total)} (test)
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void finish("failed")}
                className={cn("flex h-11 items-center justify-center gap-2 rounded-full border border-line text-sm font-medium text-text-strong hover:bg-black/4 disabled:opacity-60", focusRing)}
              >
                {busy === "failed" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
                Make it fail (test)
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
