import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditProduct } from "@/features/catalog/edit-product";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Edit product · Muhrak Seller Centre" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SellerEditProductPage({ params }: PageProps<"/seller/products/[id]">) {
  return (
    <Suspense fallback={null}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Only a UUID can name a product; anything else is a 404 without calling the API.
  if (!UUID.test(id)) notFound();
  return <EditProduct id={id} />;
}
