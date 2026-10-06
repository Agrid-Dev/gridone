import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Whether the page is being printed: from the browser's `beforeprint` to
 * its `afterprint`, whatever started it (the page's button or the browser's
 * own shortcut). The flag is committed inside the event, so a sheet that
 * renders only for the print is in the document before the browser lays
 * the page out for paper. The dark theme is lifted for the print, since
 * paper is white, and put back afterwards.
 *
 * With `browserPrint` off, only `print()` prints the sheet: a plate among
 * other content (a dashboard) leaves the browser's own print to that page,
 * and its button prints that plate alone.
 */
export function usePrintSheet(browserPrint = true): {
  printing: boolean;
  print: () => void;
} {
  const [printing, setPrinting] = useState(false);
  const asked = useRef(false);
  useEffect(() => {
    const root = document.documentElement;
    let lifted = false;
    const restore = () => {
      if (lifted) root.classList.add("dark");
      lifted = false;
    };
    const before = () => {
      if (!browserPrint && !asked.current) return;
      // A second `beforeprint` before the `afterprint` finds the theme
      // already lifted: it must not forget it was dark.
      lifted = lifted || root.classList.contains("dark");
      root.classList.remove("dark");
      flushSync(() => setPrinting(true));
    };
    const after = () => {
      asked.current = false;
      restore();
      setPrinting(false);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      restore();
    };
  }, [browserPrint]);
  const print = useCallback(() => {
    asked.current = true;
    window.print();
  }, []);
  return { printing, print };
}
