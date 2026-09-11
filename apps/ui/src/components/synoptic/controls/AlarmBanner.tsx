export type Alarm = {
  id: string;
  time: string;
  text: string;
  severity: "critical" | "warning" | "info";
  acked?: boolean;
};

type AlarmBannerProps = {
  x: number;
  y: number;
  w: number;
  alarms: Alarm[];
  maxRows?: number;
  /** Click a row to acknowledge it. */
  onAck?: (id: string) => void;
};

const SEV_COLOR: Record<Alarm["severity"], string> = {
  critical: "#e2333f",
  warning: "#f0af3d",
  info: "#5b9bd5",
};

const ROW_H = 30;

/** ISA-style alarm banner: color-coded rows, unacknowledged alarms blink, click to ack. */
export function AlarmBanner({
  x,
  y,
  w,
  alarms,
  maxRows = 3,
  onAck,
}: AlarmBannerProps) {
  const shown = alarms.slice(0, maxRows);
  return (
    <g>
      {shown.length === 0 && (
        <text
          x={x + 10}
          y={y + ROW_H / 2}
          dominantBaseline="central"
          fill="#7f8b96"
          fontSize={13.5}
        >
          No active alarms
        </text>
      )}
      {shown.map((a, i) => {
        const ry = y + i * (ROW_H + 4);
        return (
          <g
            key={a.id}
            onClick={() => onAck?.(a.id)}
            style={{ cursor: onAck ? "pointer" : "default" }}
            className={a.acked ? undefined : "scada-blink"}
          >
            <rect
              x={x}
              y={ry}
              width={w}
              height={ROW_H}
              rx={3}
              fill={SEV_COLOR[a.severity]}
              fillOpacity={a.acked ? 0.3 : 0.92}
            />
            <text
              x={x + 10}
              y={ry + ROW_H / 2}
              dominantBaseline="central"
              fill={a.acked ? "#c9d2da" : "#ffffff"}
              fontSize={13.5}
              fontWeight={600}
            >
              {a.time} — {a.text}
              {a.acked ? "  ✓ ACK" : ""}
            </text>
          </g>
        );
      })}
    </g>
  );
}
