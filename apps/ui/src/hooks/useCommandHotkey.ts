import { useEffect, useRef } from "react";

/** Invoke *onTrigger* when the user presses the command-palette chord
 *  (⌘K on macOS, Ctrl+K elsewhere), anywhere in the document.
 *
 *  Deliberately NOT built on ``useFocusHotkey``: that hook focuses a DOM node
 *  and suppresses itself while the user types, both of which are wrong here. A
 *  palette has no element to focus (the dialog does not exist until it opens),
 *  and it must stay reachable *from inside* an input — that is the whole point
 *  of a global chord.
 *
 *  ``preventDefault`` runs before the callback because browsers bind ⌘K
 *  themselves (Chrome's omnibox search mode, Firefox's search bar). */
export function useCommandHotkey(onTrigger: () => void) {
  const callback = useRef(onTrigger);

  useEffect(() => {
    callback.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey) return;
      // Holding the chord must open the palette once, not once per repeat.
      if (event.repeat) return;
      event.preventDefault();
      callback.current();
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);
}
