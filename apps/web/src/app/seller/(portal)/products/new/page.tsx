import type { Metadata } from "next";
import { ProductForm } from "@/features/catalog/product-form";

export const metadata: Metadata = { title: "Add product · Muhrak Seller Centre" };

export default function SellerAddProductPage() {
  return <ProductForm product={null} />;
}
