import type { Metadata } from "next";
import { Suspense } from "react";
import { MessengerPage } from "@/features/chat/messenger-page";

export const metadata: Metadata = { title: "Messenger · Muhrak Buyer Centre" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MessengerPage side="buyer" />
    </Suspense>
  );
}
