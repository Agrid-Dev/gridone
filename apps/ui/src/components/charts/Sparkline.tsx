import { cn } from "@/lib/utils";

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 24;

/** Builds the polyline path in viewBox units: x spreads the samples evenly,
 *  y maps [min, max] onto the full height, inverted (SVG y grows downward).
 *  A flat series (min === max) is drawn on the mid-line rather than dividing
 *  by a zero range. */
function sparklinePath(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const step = VIEWBOX_WIDTH / (values.length - 1);

  return values
    .map((value, index) => {
      const x = index * step;
      const y =
        range === 0
          ? VIEWBOX_HEIGHT / 2
          : VIEWBOX_HEIGHT - ((value - min) / range) * VIEWBOX_HEIGHT;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * A trend line with no axes, labels or interaction — the shape of a series,
 * sized by its container. Deliberately plain SVG: at this size a charting
 * library's scales and layout would cost more than they buy, and the fleet
 * grid renders one per card.
 *
 * Renders nothing below two samples: a single point has no trend to show.
 */
export function Sparkline({
  values,
  className,
  ariaLabel,
}: {
  values: number[];
  className?: string;
  ariaLabel?: string;
}) {
  if (values.length < 2) return null;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-6 w-full overflow-visible text-primary/60", className)}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <path
        d={sparklinePath(values)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
