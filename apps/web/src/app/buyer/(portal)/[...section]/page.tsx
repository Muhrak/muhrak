import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ComingSoon } from "@/components/layout/coming-soon";
import { allSectionSlugs, sectionLabel } from "@/components/layout/portal-nav";

/** Menu pages that are not built yet. Unknown paths are a real 404. */
export function generateStaticParams() {
  return allSectionSlugs("buyer")
    .filter((slug) => slug !== "dashboard")
    .map((slug) => ({ section: [slug] }));
}

export default function BuyerSectionPage({ params }: PageProps<"/buyer/[...section]">) {
  return (
    <Suspense fallback={null}>
      <Section params={params} />
    </Suspense>
  );
}

async function Section({ params }: { params: Promise<{ section: string[] }> }) {
  const { section } = await params;
  const title = section[0] ? sectionLabel("buyer", section[0]) : undefined;
  if (!title) notFound();
  return <ComingSoon side="buyer" title={title} />;
}
