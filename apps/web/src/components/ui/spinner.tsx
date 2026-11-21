import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Loading inside a page: a list, a panel, a detail (developer rule, 21 Nov
 * 2026). The Muhrak logo is kept for whole-page loads only (PageLoader).
 */
export function Spinner({ size = 22, label = "Loading", className }: { size?: number; label?: string; className?: string }) {
  return (
    <span role="status" className={cn("flex items-center justify-center text-text-subtle", className)}>
      <Loader2 aria-hidden className="animate-spin" style={{ width: size, height: size }} strokeWidth={2} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
