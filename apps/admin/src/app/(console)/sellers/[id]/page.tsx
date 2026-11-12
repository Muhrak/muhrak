"use client";

import { notFound, useParams } from "next/navigation";
import { ReviewPage } from "@/features/sellers/review-page";

export default function AdminSellerReviewPage() {
  const { id } = useParams<{ id: string }>();
  // Only a UUID can name a seller; anything else is a 404 without calling the API.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <ReviewPage userId={id} />;
}
