import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ComingSoon } from "@/components/layout/coming-soon";
import { allSectionSlugs, sectionLabel } from "@/components/layout/portal-nav";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

/** Pages with their own route folder. */
const BUILT = new Set(["dashboard", "company-profile", "verification"]);

/** Menu pages that are not built yet. Unknown paths are a real 404. */
export function generateStaticParams() {
  return allSectionSlugs("seller")
    .filter((slug) => !BUILT.has(slug))
    .map((slug) => ({ section: [slug] }));
}

export default function SellerSectionPage({ params }: PageProps<"/seller/[...section]">) {
  return (
    <Suspense fallback={null}>
      <Section params={params} />
    </Suspense>
  );
}

async function Section({ params }: { params: Promise<{ section: string[] }> }) {
  const { section } = await params;
  const title = section[0] ? sectionLabel("seller", section[0]) : undefined;
  if (!title) notFound();
  return <ComingSoon side="seller" title={title} />;
}
