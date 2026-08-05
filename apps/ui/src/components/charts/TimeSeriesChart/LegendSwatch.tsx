export function LegendSwatch({
  color,
  variant,
  dash = false,
}: {
  color: string;
  variant: "line" | "area";
  dash?: boolean;
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
          : { backgroundColor: color }),
        opacity: variant === "area" ? 0.5 : 1,
        marginInline: variant === "area" ? 3 : 0,
      }}
    />
  );
}
