export function LegendSwatch({
  color,
  variant,
  dash = false,
  hollow = false,
}: {
  color: string;
  variant: "line" | "area";
  dash?: boolean;
  /** Outline an area swatch instead of filling it — a boolean's off state. */
  hollow?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        width: variant === "line" ? 16 : 10,
        height: variant === "line" ? 3 : 10,
        borderRadius: variant === "line" ? 1 : 2,
        // Dashed line swatches paint stripes instead of a solid bar,
        // mirroring the series' strokeDasharray.
        ...(dash && variant === "line"
          ? {
              backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 8px)`,
            }
          : hollow && variant === "area"
            ? {
                backgroundColor: "transparent",
                boxShadow: `inset 0 0 0 1.5px ${color}`,
              }
            : { backgroundColor: color }),
        opacity: variant === "area" ? 0.5 : 1,
        marginInline: variant === "area" ? 3 : 0,
      }}
    />
  );
}
