import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductsPage } from "@/features/catalog/products-page";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Products · Muhrak Seller Centre" };

export default function SellerProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPage />
    </Suspense>
  );
}
