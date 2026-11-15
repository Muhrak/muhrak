import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchPage } from "@/features/search/search-page";

export const metadata: Metadata = {
  title: "Find a part · Muhrak",
  description: "Search spare parts from verified sellers across the GCC by part number, part name or machine, and ask for a quote.",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  );
}
