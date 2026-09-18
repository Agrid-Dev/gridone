import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { flushSync } from "react-dom";

/** Debounced server-side name search. Blur flushes before a destination link captures the URL. */
export function useDeviceSearchParam() {
  const [params, setParams] = useSearchParams();
  const applied = params.get("search") ?? "";
  const [value, setValue] = useState(applied);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    setValue(applied);
  }, [applied]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const apply = (next: string) => {
    clearTimeout(timer.current);
    const search = next.trim();
    if (search === applied) return;
    setParams(
      (previous) => {
        const result = new URLSearchParams(previous);
        if (search) result.set("search", search);
        else result.delete("search");
        return result;
      },
      { replace: true },
    );
  };
  const change = (next: string) => {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(next), 300);
  };
  const commit = () => flushSync(() => apply(value));
  const clear = () => {
    setValue("");
    apply("");
  };
  return { value, change, commit, clear };
}
