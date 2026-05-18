import { useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";
import type { MockDevice, RoomGeometry } from "./data/types";
import { computeScenarioState } from "./data/scenario";

type Props = {
  room: RoomGeometry;
  currentTime: number;
  values: Map<string, number>;
  statuses: Map<string, "ok" | "alert">;
  onClose: () => void;
};

const CHART_WIDTH = 360;
const CHART_HEIGHT = 110;
const HISTORY_SECONDS = 60;
const HISTORY_POINTS = 60;

function formatLatest(device: MockDevice, value: number | undefined): string {
  if (value === undefined) return "—";
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

function MiniChart({
  device,
  currentTime,
}: {
  device: MockDevice;
  currentTime: number;
}) {
  const points = useMemo(() => {
    const arr: { t: number; v: number }[] = [];
    const step = HISTORY_SECONDS / HISTORY_POINTS;
    for (let i = 0; i <= HISTORY_POINTS; i++) {
      const t = Math.max(0, currentTime - HISTORY_SECONDS + i * step);
      const state = computeScenarioState(t);
      const v = state.values.get(device.id) ?? device.baseline;
      arr.push({ t, v });
    }
    return arr;
  }, [device, currentTime]);

  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.5, max - min);
  const path = points
    .map((p, i) => {
      const x = (i / HISTORY_POINTS) * CHART_WIDTH;
      const y = CHART_HEIGHT - ((p.v - min) / range) * (CHART_HEIGHT - 8) - 4;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const stroke =
    device.kind === "thermostat"
      ? "#fb923c"
      : device.kind === "co2"
        ? "#a78bfa"
        : "#34d399";

  return (
    <svg
      width={CHART_WIDTH}
      height={CHART_HEIGHT}
      className="overflow-visible"
      role="img"
      aria-label={`${device.name} timeseries`}
    >
      <defs>
        <linearGradient id={`grad-${device.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.6" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L ${CHART_WIDTH} ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`}
        fill={`url(#grad-${device.id})`}
      />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.8} />
    </svg>
  );
}

export function RoomDetailOverlay({
  room,
  currentTime,
  values,
  statuses,
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isAlerting = room.devices.some((d) => statuses.get(d.id) === "alert");

  return (
    <div
      className="absolute right-6 top-6 z-20 w-[400px] rounded-2xl border border-white/10 bg-black/80 p-5 text-white shadow-2xl backdrop-blur-xl"
      ref={cardRef}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">
            {room.kind} · {room.assetId}
          </div>
          <h2 className="font-display text-xl font-semibold leading-tight text-white">
            {room.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="Close room detail"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isAlerting ? (
        <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm">
          <div className="font-medium text-rose-200">Active alert</div>
          <div className="text-xs text-rose-300/80">
            Setpoint exceeded. Investigate ventilation.
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {room.devices.map((device) => {
          const v = values.get(device.id);
          const status = statuses.get(device.id) ?? "ok";
          return (
            <div
              key={device.id}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-white/55">
                    {device.kind}
                  </div>
                  <div className="font-medium text-white">{device.name}</div>
                </div>
                <div
                  className={`font-mono text-lg ${
                    status === "alert" ? "text-rose-300" : "text-emerald-300"
                  }`}
                >
                  {formatLatest(device, v)}
                </div>
              </div>
              {device.kind !== "occupancy" ? (
                <div className="mt-2">
                  <MiniChart device={device} currentTime={currentTime} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-[10px] uppercase tracking-[0.18em] text-white/40">
        Click outside or press Esc to return
      </div>
    </div>
  );
}
