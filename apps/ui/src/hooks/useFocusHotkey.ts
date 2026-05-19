import { useEffect, type RefObject } from "react";

/** Focus the referenced element when *key* is pressed anywhere outside an
 *  already-editable target. Mirrors the GitHub-style ``/``-to-focus-search
 *  pattern: the shortcut is suppressed while the user is typing in an
 *  input/textarea/contenteditable, so it never eats real keystrokes. */
export function useFocusHotkey(
  key: string,
  ref: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (event.key !== key) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      ref.current?.focus();
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [key, ref]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest("[contenteditable='true'], [contenteditable='']")) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
