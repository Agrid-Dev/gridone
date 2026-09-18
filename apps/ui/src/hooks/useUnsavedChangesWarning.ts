import { useEffect } from "react";

/** Warns on a reload or a close while `dirty`: the browser's own prompt,
 *  the one thing a page can still do for work it has not saved. In-app
 *  navigation is each editor's own concern. */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
