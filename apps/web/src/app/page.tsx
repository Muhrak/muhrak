import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Placeholder home page. The real buyer and seller landing pages come later (P1). */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Muhrak</h1>
      <p className="text-lg text-muted-foreground">
        Snap a photo of a spare part, get it identified, and receive quotes from verified sellers across the GCC.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/signup" className={buttonVariants({ size: "lg", className: "h-10 px-5" })}>
          Create an account
        </Link>
        <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 px-5" })}>
          Log in
        </Link>
      </div>
    </main>
  );
}
