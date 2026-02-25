export function LegendSwatch({
  color,
  variant,
}: {
  color: string;
  variant: "line" | "area";
}) {
  return (
    <span
      style={{
        display: "inline-block",
        width: variant === "line" ? 16 : 10,
        height: variant === "line" ? 3 : 10,
        borderRadius: variant === "line" ? 1 : 2,
        backgroundColor: color,
        opacity: variant === "area" ? 0.5 : 1,
        marginInline: variant === "area" ? 3 : 0,
      }}
    />
  );
}
