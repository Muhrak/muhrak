import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SellerProfile } from "@/features/storefront/seller-profile";

export const metadata: Metadata = { title: "Seller · Muhrak" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SellerPage({ params }: PageProps<"/sellers/[id]">) {
  return (
    <Suspense fallback={null}>
      <Seller params={params} />
    </Suspense>
  );
}

async function Seller({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Only a UUID can name a seller; anything else is a 404 without calling the API.
  if (!UUID.test(id)) notFound();
  return <SellerProfile id={id} />;
}
