import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReviewPage } from "@/features/admin/sellers/review-page";

export const instant = false;
export const metadata: Metadata = { title: "Seller review · Muhrak Admin Console" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AdminSellerReviewPage({ params }: PageProps<"/admin/sellers/[id]">) {
  return (
    <Suspense fallback={null}>
      <Review params={params} />
    </Suspense>
  );
}

async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Only a UUID can name a seller; anything else is a 404 without calling the API.
  if (!UUID.test(id)) notFound();
  return <ReviewPage userId={id} />;
}
