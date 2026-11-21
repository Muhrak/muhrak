import { cn } from "@/lib/utils";

const RATIO = 29.8588 / 156.357; // height / width of the Muhrak logo

/**
 * Loading state: the Muhrak logo with a white reflection sweeping across it
 * (CSS `.logo-shine` in globals.css; static for reduced motion). `size` is
 * the logo width: 156 for a full page, 104 inside a card or list.
 */
export function LogoLoader({ size = 104, label = "Loading", className }: { size?: number; label?: string; className?: string }) {
  return (
    <span role="status" className={cn("flex items-center justify-center", className)}>
      <span aria-hidden className="logo-shine block" style={{ width: size, height: size * RATIO }} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * A whole page (or tab) loading: the Muhrak logo, centred in the free space
 * of the page (developer rule, 21 Nov 2026). Anything smaller that loads
 * inside a page uses <Spinner> instead.
 */
export function PageLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex min-h-[50dvh] flex-1 items-center justify-center", className)}>
      <LogoLoader size={156} label={label} />
    </div>
  );
}
