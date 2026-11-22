"use client";

import { ArrowLeft, CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { formatMoney, type Order } from "@/schemas";
import type { PortalSide } from "@/features/auth/paths";
import { RfqChip } from "@/features/rfq/parts";
import { focusRing } from "@/features/seller/parts";
import { WorkspacePanel, WorkspaceSplit } from "@/components/layout/workspace";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { startPayment, useCancelOrder, useOrder, useOrders } from "./api";
import { OrderAmounts, orderDate, orderDateTime, orderStatus } from "./parts";

/**
 * Orders (Day 12) for the buyer and the seller: one full-height panel like
 * the Messenger, list on the left and the order on the right. The buyer pays
 * here; after the gateway the buyer comes back with `checking=1` and the page
 * waits for the gateway's confirmation (only the signed webhook marks an
 * order paid, never this page).
 */
export function OrdersPage({ side }: { side: PortalSide }) {
  const params = useSearchParams();
  const router = useRouter();
  const idParam = params.get("id");
  const checking = params.get("checking") === "1";
  const list = useOrders(side);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const activeId = idParam ?? items[0]?.id ?? null;

  const go = (id: string | null) => router.replace(id ? `/${side}/orders?id=${encodeURIComponent(id)}` : `/${side}/orders`, { scroll: false });

  return (
    <WorkspacePanel
      side={side}
      title="Orders"
      description={side === "buyer" ? "Your orders and payments." : "Orders from buyers. Pack and ship once paid."}
    >
      <WorkspaceSplit
        showDetail={Boolean(idParam)}
        list={
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {list.isPending ? (
              <Spinner label="Loading orders" className="py-10" />
            ) : list.isError ? (
              <p role="alert" className="px-4 py-10 text-center text-sm text-destructive">
                Could not load orders. Reload the page to try again.
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-text-muted">
                {side === "buyer" ? "No orders yet. Confirm a quotation from Inquiries & RFQs to order it." : "No orders yet. They appear here when a buyer confirms your quotation."}
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {items.map((order) => (
                  <li key={order.id}>
                    <OrderRow side={side} order={order} active={order.id === activeId} onOpen={() => go(order.id)} />
                  </li>
                ))}
              </ul>
            )}
            {list.hasNextPage ? (
              <button
                type="button"
                onClick={() => void list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
                className={cn("mx-auto my-2 flex h-9 items-center rounded-full border border-line px-4 text-sm font-medium text-text-strong hover:bg-black/4 disabled:opacity-60", focusRing)}
              >
                {list.isFetchingNextPage ? "Loading…" : "Show more"}
              </button>
            ) : null}
          </div>
        }
        detail={
          activeId ? (
            <OrderDetail key={activeId} side={side} id={activeId} checking={checking && activeId === idParam} onBack={() => go(null)} />
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center p-8 text-center text-sm text-text-muted">Your orders appear here.</div>
          )
        }
      />
    </WorkspacePanel>
  );
}

function OrderRow({ side, order, active, onOpen }: { side: PortalSide; order: Order; active: boolean; onOpen: () => void }) {
  const status = orderStatus(order.status, side);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={cn("flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left hover:bg-surface", active && "bg-surface", focusRing)}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
        <span className="truncate text-[15px] font-medium text-text-strong">
          {order.reference} · {side === "buyer" ? order.seller.companyName : order.buyer.name}
        </span>
        <span className="truncate text-xs text-text-subtle">
          {formatMoney(order.total)} · {orderDate(order.createdAt)}
        </span>
      </span>
      <RfqChip tone={status.tone}>{status.label}</RfqChip>
    </button>
  );
}

function OrderDetail({ side, id, checking, onBack }: { side: PortalSide; id: string; checking: boolean; onBack: () => void }) {
  const query = useOrder(side, id, { checking });
  const order = query.data;
  if (query.isPending) return <Spinner className="h-full min-h-[240px]" />;
  if (!order) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-[15px] text-text-muted">This order could not be found.</p>
        <button type="button" onClick={onBack} className={cn("text-sm font-medium text-text-strong underline", focusRing)}>
          Back to your orders
        </button>
      </div>
    );
  }
  const status = orderStatus(order.status, side);
  const requestHref = side === "buyer" ? `/buyer/requests?id=${encodeURIComponent(order.rfqId)}` : `/seller/rfq-inbox?id=${encodeURIComponent(order.rfqId)}`;

  return (
    <article className="flex flex-col gap-5 p-5 sm:p-6">
      <button type="button" onClick={onBack} className={cn("flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-text-muted hover:text-text-strong lg:hidden", focusRing)}>
        <ArrowLeft aria-hidden className="size-4" />
        All orders
      </button>

      <header className="flex flex-col gap-2.5 leading-[normal]">
        <span className="flex">
          <RfqChip tone={status.tone}>{status.label}</RfqChip>
        </span>
        <h2 className="text-xl font-medium tracking-[-0.01em] text-text-strong sm:text-[22px]">Order {order.reference}</h2>
        <p className="text-[13px] text-text-subtle">
          {side === "buyer" ? `From ${order.seller.companyName}` : `For ${order.buyer.name}`} · Confirmed {orderDate(order.createdAt)} · Quotation {order.quotationReference}
        </p>
      </header>

      {side === "buyer" ? <BuyerState order={order} checking={checking} /> : <SellerState order={order} />}

      <section aria-label="Amounts" className="flex flex-col gap-3 rounded-[20px] border border-line p-4 sm:p-5">
        <OrderAmounts order={order} />
        <p className="text-[13px] text-text-muted">
          Delivery within {order.deliveryDays} day{order.deliveryDays === 1 ? "" : "s"} after payment.
        </p>
      </section>

      <section aria-label="Delivery" className="flex flex-col gap-2">
        <p className="text-sm font-medium text-text-strong">Deliver to</p>
        {order.delivery ? (
          <div className="flex flex-col gap-0.5 text-[15px] leading-[1.5] break-words text-text-body">
            <span className="text-text-strong">{order.delivery.recipientName}</span>
            <span>{order.delivery.phone}</span>
            <span>{order.delivery.addressLine}</span>
            <span>
              {order.delivery.city}, {order.delivery.countryName}
            </span>
            {order.delivery.notes ? <span className="text-text-muted">{order.delivery.notes}</span> : null}
          </div>
        ) : (
          <p className="text-sm text-text-muted">The buyer&apos;s address and phone appear here once the order is paid.</p>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href={requestHref} className={cn("rounded-full border border-line px-4 py-2 text-sm font-medium text-text-strong hover:bg-black/4", focusRing)}>
          View quotation {order.quotationReference}
        </Link>
        <Link
          href={`/${side}/messages?rfq=${encodeURIComponent(order.rfqId)}`}
          className={cn("rounded-full border border-line px-4 py-2 text-sm font-medium text-text-strong hover:bg-black/4", focusRing)}
        >
          Open chat
        </Link>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- buyer

function Notice({ tone, title, children }: { tone: "info" | "success" | "error"; title: string; children?: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? CircleAlert : Loader2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-[16px] p-4",
        tone === "success" ? "bg-success/12" : tone === "error" ? "bg-destructive/8" : "bg-surface",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", tone === "info" && "animate-spin text-text-muted", tone === "success" && "text-success", tone === "error" && "text-destructive")} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-[15px] font-medium text-text-strong">{title}</p>
        {children}
      </div>
    </div>
  );
}

function BuyerState({ order, checking }: { order: Order; checking: boolean }) {
  if (order.status === "awaiting_payment") {
    const failed = order.payment?.status === "failed";
    if (checking && !failed) return <CheckingPayment />;
    return (
      <>
        {failed ? <Notice tone="error" title="The payment did not go through. No money was taken; you can try again." /> : null}
        <PayBox order={order} />
      </>
    );
  }
  if (order.status === "cancelled") {
    return (
      <Notice tone="error" title="This order was cancelled.">
        <p className="text-sm text-text-body">{order.cancelReason ?? ""}. The quotation can be confirmed again while it is valid.</p>
      </Notice>
    );
  }
  if (order.status === "refunded") return <Notice tone="info" title="This order was refunded." />;
  return (
    <Notice tone="success" title={`Paid${order.paidAt ? ` on ${orderDate(order.paidAt)}` : ""}. Thank you.`}>
      <p className="text-sm text-text-body">
        {order.seller.companyName} will prepare your order and deliver within {order.deliveryDays} day{order.deliveryDays === 1 ? "" : "s"}. Muhrak holds the payment and pays the seller
        only after you receive it.
      </p>
    </Notice>
  );
}

/** Back from the gateway: wait for its signed confirmation (polled every 2 s by useOrder). */
function CheckingPayment() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 30_000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <Notice tone="info" title="Checking your payment…">
      <p className="text-sm text-text-body">
        {slow ? "This is taking longer than usual. You can leave this page; the order updates as soon as the payment is confirmed." : "This usually takes a few seconds. Please keep this page open."}
      </p>
    </Notice>
  );
}

function PayBox({ order }: { order: Order }) {
  const toast = useToast();
  const cancel = useCancelOrder();
  const [paying, setPaying] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function pay() {
    setPaying(true);
    try {
      const { checkoutUrl } = await startPayment(order.id);
      window.location.assign(checkoutUrl);
    } catch (error) {
      setPaying(false);
      toast.error(error instanceof ApiError ? error.message : "The payment page could not be opened. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
          <p className="text-[15px] font-medium text-text-strong">Pay {formatMoney(order.total)} to start your order</p>
          <p className="text-[13px] text-text-muted">
            {order.paymentDueAt ? `Pay by ${orderDateTime(order.paymentDueAt)}, or the order is cancelled. ` : ""}You pay Muhrak; the seller is paid after delivery.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void pay()}
          disabled={paying}
          className={cn("flex h-11 items-center gap-2 rounded-full bg-side-accent px-6 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-60", focusRing)}
        >
          {paying ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {paying ? "Opening payment…" : `Pay ${formatMoney(order.total)}`}
        </button>
      </div>
      {confirmCancel ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <p className="min-w-0 flex-1 text-sm text-text-body">Cancel this order? The quotation stays available while it is valid.</p>
          <button
            type="button"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(order.id, {
                onSuccess: () => toast.success("Order cancelled."),
                onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not cancel. Please try again."),
                onSettled: () => setConfirmCancel(false),
              })
            }
            className={cn("h-9 rounded-full bg-[#0c0c0d] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60", focusRing)}
          >
            {cancel.isPending ? "Cancelling…" : "Yes, cancel"}
          </button>
          <button type="button" onClick={() => setConfirmCancel(false)} className={cn("h-9 rounded-full border border-line px-4 text-sm font-medium text-text-strong hover:bg-black/4", focusRing)}>
            Keep it
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmCancel(true)} className={cn("w-fit rounded-sm text-sm font-medium text-text-muted hover:text-text-strong", focusRing)}>
          Cancel order
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- seller

function SellerState({ order }: { order: Order }) {
  if (order.status === "awaiting_payment") {
    return (
      <Notice tone="info" title="Waiting for the buyer to pay.">
        <p className="text-sm text-text-body">Do not send anything yet. You will see the delivery address once Muhrak confirms the payment.</p>
      </Notice>
    );
  }
  if (order.status === "cancelled") return <Notice tone="error" title={`Cancelled: ${order.cancelReason ?? "not paid"}.`} />;
  if (order.status === "paid") {
    return (
      <Notice tone="success" title={`Paid${order.paidAt ? ` on ${orderDate(order.paidAt)}` : ""}. Please prepare the order.`}>
        <p className="text-sm text-text-body">
          Deliver within {order.deliveryDays} day{order.deliveryDays === 1 ? "" : "s"}. Muhrak pays you {order.sellerAmount ? formatMoney(order.sellerAmount) : ""} after the buyer receives it.
        </p>
      </Notice>
    );
  }
  return null;
}
