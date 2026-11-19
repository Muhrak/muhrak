import type { Metadata } from "next";
import { Suspense } from "react";
import { MessengerPage } from "@/features/chat/messenger-page";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Messenger · Muhrak Seller Centre" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MessengerPage side="seller" />
    </Suspense>
  );
}
