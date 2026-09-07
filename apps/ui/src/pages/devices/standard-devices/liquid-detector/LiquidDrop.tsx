import { cn } from "@/lib/utils";
import type { LiquidVerdict } from "./verdict";

/** The drop glyph: outlined when dry, filled when liquid is present. Drawn
 *  here rather than taken from lucide because the fill toggle *is* the
 *  reading — an empty drop or a full one. */
export function LiquidDrop({
  verdict,
  className,
}: {
  verdict: LiquidVerdict | null;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={verdict === "detected" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <path d="M12 2.4 6.3 10a7.2 7.2 0 1 0 11.4 0Z" />
    </svg>
  );
}
