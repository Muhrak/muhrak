import type { Metadata } from "next";
import { ProductForm } from "@/features/catalog/product-form";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Add product · Muhrak Seller Centre" };

export default function SellerAddProductPage() {
  return <ProductForm product={null} />;
}
