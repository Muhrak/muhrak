import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdersPage } from "@/features/order/orders-page";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Orders · Muhrak Seller Centre" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OrdersPage side="seller" />
    </Suspense>
  );
}
