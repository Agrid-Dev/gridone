import type { Severity } from "@gridone/sdk";
import { SEMANTIC_FILL_CLASS, SEVERITY_LEVEL } from "@/lib/semanticColors";

export type Alarm = {
  id: string;
  time: string;
  text: string;
  severity: Severity;
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

const ROW_H = 30;

/** ISA-style alarm banner: colour-coded rows, unacknowledged alarms blink, click to ack. */
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
          fontSize={13.5}
          className="fill-muted-foreground"
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
            className={
              a.acked ? undefined : "animate-blink motion-reduce:animate-none"
            }
          >
            <rect
              x={x}
              y={ry}
              width={w}
              height={ROW_H}
              rx={3}
              fillOpacity={a.acked ? 0.3 : 0.92}
              className={SEMANTIC_FILL_CLASS[SEVERITY_LEVEL[a.severity]]}
            />
            <text
              x={x + 10}
              y={ry + ROW_H / 2}
              dominantBaseline="central"
              fontSize={13.5}
              fontWeight={600}
              className={a.acked ? "fill-muted-foreground" : "fill-white"}
            >
              {a.time} {a.text}
              {a.acked ? "  ACK" : ""}
            </text>
          </g>
        );
      })}
    </g>
  );
}
