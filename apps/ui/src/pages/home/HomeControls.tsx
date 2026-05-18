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
    <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/70 px-4 py-3 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {paused ? (
            <button
              type="button"
              onClick={onStart}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400"
              aria-label="Start scenario"
            >
              <Play className="h-5 w-5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg shadow-amber-500/40 transition hover:bg-amber-400"
              aria-label="Pause scenario"
            >
              <Pause className="h-5 w-5 fill-current" />
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Restart scenario"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-w-[220px] flex-col">
          <div className="font-mono text-xs text-white/60">
            Scenario · {formatTime(time)} / {formatTime(LOOP_SECONDS)}
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 transition-[width]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        <div className="border-l border-white/10 pl-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">
            Status
          </div>
          <div className="font-medium text-white">
            {paused ? "Paused" : "Running"}
          </div>
        </div>
      </div>
    </div>
  );
}
