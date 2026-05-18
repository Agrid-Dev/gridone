import { Pause, Play, RotateCcw } from "lucide-react";
import { LOOP_SECONDS } from "./data/scenario";

type Props = {
  paused: boolean;
  time: number;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
};

function formatTime(t: number): string {
  const minutes = Math.floor(t / 60);
  const seconds = Math.floor(t % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function HomeControls({
  paused,
  time,
  onStart,
  onStop,
  onRestart,
}: Props) {
  const progress = Math.min(1, time / LOOP_SECONDS);
  return (
    <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-2xl border border-border bg-card/95 px-4 py-3 text-card-foreground shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {paused ? (
            <button
              type="button"
              onClick={onStart}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-success-foreground shadow-lg shadow-success/40 transition hover:opacity-90"
              aria-label="Start scenario"
            >
              <Play className="h-5 w-5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-lg shadow-warning/40 transition hover:opacity-90"
              aria-label="Pause scenario"
            >
              <Pause className="h-5 w-5 fill-current" />
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Restart scenario"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-w-[220px] flex-col">
          <div className="font-mono text-xs text-muted-foreground">
            Scenario · {formatTime(time)} / {formatTime(LOOP_SECONDS)}
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-gradient-to-r from-primary via-success to-warning transition-[width]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        <div className="border-l border-border pl-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Status
          </div>
          <div className="font-medium">{paused ? "Paused" : "Running"}</div>
        </div>
      </div>
    </div>
  );
}
