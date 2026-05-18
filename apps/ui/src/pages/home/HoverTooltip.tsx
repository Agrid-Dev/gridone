import type { MockDevice, RoomGeometry } from "./data/types";

type Props = {
  room: RoomGeometry | null;
  device: { device: MockDevice; room: RoomGeometry } | null;
  values: Map<string, number>;
  statuses: Map<string, "ok" | "alert">;
  mousePos: { x: number; y: number } | null;
};

function formatValue(device: MockDevice, value: number): string {
  switch (device.kind) {
    case "thermostat":
      return `${value.toFixed(1)} ${device.unit}`;
    case "co2":
      return `${Math.round(value)} ${device.unit}`;
    case "occupancy":
      return value >= 0.5 ? "Occupied" : "Vacant";
    default:
      return `${value.toFixed(1)} ${device.unit}`;
  }
}

export function HoverTooltip({
  room,
  device,
  values,
  statuses,
  mousePos,
}: Props) {
  if (!mousePos) return null;
  const target = device?.room ?? room;
  if (!target) return null;

  const focusDevice = device?.device;
  const status = focusDevice ? statuses.get(focusDevice.id) : undefined;

  return (
    <div
      className="pointer-events-none fixed z-30 min-w-[200px] max-w-[280px] rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-2xl backdrop-blur-md"
      style={{
        left: mousePos.x + 16,
        top: mousePos.y + 16,
      }}
    >
      <div className="font-display text-sm font-semibold">{target.name}</div>
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {target.kind}
      </div>
      <div className="space-y-1">
        {target.devices.map((d) => {
          const v = values.get(d.id);
          const s = statuses.get(d.id) ?? "ok";
          const isFocus = focusDevice?.id === d.id;
          return (
            <div
              key={d.id}
              className={`flex items-center justify-between gap-3 rounded px-1.5 py-0.5 ${
                isFocus ? "bg-accent" : ""
              }`}
            >
              <span className="text-muted-foreground">{d.name}</span>
              <span
                className={`font-mono text-[11px] ${
                  s === "alert"
                    ? "text-destructive"
                    : isFocus
                      ? "text-primary"
                      : ""
                }`}
              >
                {v !== undefined ? formatValue(d, v) : "—"}
              </span>
            </div>
          );
        })}
      </div>
      {status === "alert" ? (
        <div className="mt-2 rounded bg-destructive/20 px-2 py-1 text-[10px] font-medium text-destructive">
          Alert active
        </div>
      ) : null}
    </div>
  );
}
