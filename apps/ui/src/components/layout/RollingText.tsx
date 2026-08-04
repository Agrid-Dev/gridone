import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Must match the `roll-out` / `roll-in` duration in tailwind.config.js. */
const ROLL_MS = 350;

/** Odometer-style text swap: when *value* changes, the old text rises out of
 *  the frame while the new one climbs in from below.
 *
 *  Both values are on screen together for the length of the animation, so they
 *  are absolutely positioned over an invisible copy of the current value —
 *  that copy is what gives the box its width and height, keeping the component
 *  usable inline without hard-coded dimensions.
 *
 *  Honours `prefers-reduced-motion`: the swap becomes instant. */
export function RollingText({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [current, setCurrent] = useState(value);
  const [outgoing, setOutgoing] = useState<string | null>(null);

  // Promote the incoming value, remembering the one it replaces.
  useEffect(() => {
    if (value === current) return;
    setOutgoing(current);
    setCurrent(value);
  }, [value, current]);

  // Retire the outgoing value once its animation has had time to play. This
  // has to be its own effect: scheduling the timer alongside `setCurrent`
  // above would put it in an effect whose deps that very update changes, so
  // React would run the cleanup and cancel the timer before it ever fired.
  useEffect(() => {
    if (outgoing === null) return;
    const timer = setTimeout(() => setOutgoing(null), ROLL_MS);
    return () => clearTimeout(timer);
  }, [outgoing]);

  return (
    <span
      className={cn(
        "relative inline-grid overflow-hidden align-bottom",
        className,
      )}
    >
      {/* Sizer: reserves the box, never seen. */}
      <span aria-hidden className="invisible">
        {current}
      </span>

      {outgoing !== null && (
        <span
          key={`out-${outgoing}`}
          aria-hidden
          className="absolute inset-0 animate-roll-out motion-reduce:hidden"
        >
          {outgoing}
        </span>
      )}

      <span
        key={`in-${current}`}
        className={cn(
          "absolute inset-0",
          outgoing !== null && "animate-roll-in motion-reduce:animate-none",
        )}
      >
        {current}
      </span>
    </span>
  );
}
