import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

/** Current time, re-rendering once per wall-clock minute.
 *
 *  The timeout is aligned to the next minute boundary rather than a flat
 *  ``setInterval(60_000)``: an interval started at :30s would display a value
 *  up to 59s stale and drift further with every tick. Recomputing the
 *  remainder on each tick makes the drift self-correcting.
 *
 *  Timers are throttled in hidden tabs and suspended across sleep, so a
 *  ``visibilitychange`` listener resyncs on return rather than showing a time
 *  that is minutes behind.
 *
 *  Call this inside the leaf that renders the time, never in a parent — every
 *  sibling would otherwise re-render once a minute for nothing. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setTimeout(
      () => setNow(new Date()),
      MINUTE_MS - (Date.now() % MINUTE_MS),
    );

    function resync() {
      if (document.visibilityState === "visible") setNow(new Date());
    }
    document.addEventListener("visibilitychange", resync);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [now]);

  return now;
}
