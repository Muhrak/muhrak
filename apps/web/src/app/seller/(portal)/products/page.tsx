import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductsPage } from "@/features/catalog/products-page";

export const metadata: Metadata = { title: "Products · Muhrak Seller Centre" };

export default function SellerProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPage />
    </Suspense>
  );
}
