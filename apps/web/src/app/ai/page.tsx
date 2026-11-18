import type { Metadata } from "next";
import { Suspense } from "react";
import { MuhrakAiPage } from "@/features/ai/muhrak-ai-page";

export const metadata: Metadata = {
  title: "Muhrak AI · Find a part with a photo",
  description: "Upload a photo of the part. Muhrak AI identifies it and shows you verified sellers across the GCC who can supply it.",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MuhrakAiPage />
    </Suspense>
  );
}
