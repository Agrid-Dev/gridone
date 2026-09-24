import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Whether the page is being printed: from the browser's `beforeprint` to
 * its `afterprint`, whatever started it (the page's button or the browser's
 * own shortcut). The flag is committed inside the event, so a sheet that
 * renders only for the print is in the document before the browser lays
 * the page out for paper. The dark theme is lifted for the print, since
 * paper is white, and put back afterwards.
 */
export function usePrintSheet(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    let lifted = false;
    const restore = () => {
      if (lifted) root.classList.add("dark");
      lifted = false;
    };
    const before = () => {
      // A second `beforeprint` before the `afterprint` finds the theme
      // already lifted: it must not forget it was dark.
      lifted = lifted || root.classList.contains("dark");
      root.classList.remove("dark");
      flushSync(() => setPrinting(true));
    };
    const after = () => {
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
  }, []);
  return printing;
}
