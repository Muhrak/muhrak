"use client";

import { useSearchParams } from "next/navigation";
import { FormError } from "@/features/auth/field";
import { ApiError } from "@/lib/api";
import { useProduct } from "./api";
import { ProductForm } from "./product-form";

/** /seller/products/[id]: load the seller's own product (404 for anyone else's) and edit it. */
export function EditProduct({ id }: { id: string }) {
  const product = useProduct(id);
  // Set when "Publish product" saved the draft but publishing was refused (e.g. not verified yet).
  const publishError = useSearchParams().get("publish");

  if (product.isPending) {
    return (
      <p role="status" className="text-sm text-text-muted">
        Loading the product…
      </p>
    );
  }
  if (product.isError) {
    const missing = product.error instanceof ApiError && product.error.status === 404;
    return <FormError message={missing ? "This product does not exist." : "Could not load this product. Reload the page to try again."} />;
  }
  return (
    <>
      {publishError ? (
        <p role="alert" className="rounded-[16px] bg-seller-orange/12 px-5 py-3.5 text-sm text-text-strong">
          Saved as a draft, but not published: {publishError === "failed" ? "something went wrong." : publishError}
        </p>
      ) : null}
      {/* A new version (after a save elsewhere) starts a fresh form. */}
      <ProductForm key={`${product.data.id}-${product.data.version}`} product={product.data} />
    </>
  );
}
