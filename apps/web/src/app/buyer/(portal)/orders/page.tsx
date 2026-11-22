import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdersPage } from "@/features/order/orders-page";

export const metadata: Metadata = { title: "Orders · Muhrak Buyer Centre" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OrdersPage side="buyer" />
    </Suspense>
  );
}
