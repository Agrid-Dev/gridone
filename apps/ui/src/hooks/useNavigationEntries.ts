import { useLayoutEffect, useReducer, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import {
  currentEntry,
  flushNavigation,
  locationUrl,
  navigationStore,
  resourcePath,
  saveEntry,
  type NavigationEntry,
} from "@/lib/navigation";
import {
  captureNavigationEntry,
  restoreNavigationEntry,
} from "@/lib/navigationRestoration";

/** Record router entries separately, including replacements caused by filters. */
export function useNavigationEntries() {
  const location = useLocation();
  const action = useNavigationType();
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const previous = useRef<NavigationEntry | null>(null);
  useLayoutEffect(() => {
    const prev = previous.current;
    const known = navigationStore.entries[location.key];
    const entry = currentEntry(location);
    const index =
      window.history.state?.idx ??
      (action === "PUSH" ? (prev?.index ?? -1) + 1 : entry.index);
    entry.index = index;
    const candidate = location.state?.resumeEntry
      ? navigationStore.entries[location.state.resumeEntry]
      : undefined;
    const resumed = candidate?.url === entry.url ? candidate : undefined;
    if (!known && resumed) Object.assign(entry, { ...resumed, index });
    if (location.state?.resumeNavigation) {
      const saved = Object.values(navigationStore.entries)
        .reverse()
        .find((item) => item.url === entry.url);
      if (saved) Object.assign(entry, { ...saved, index });
    }
    if (
      !known &&
      !location.state?.resourceNavigation &&
      prev &&
      resourcePath(prev.url) &&
      resourcePath(prev.url) === resourcePath(entry.url)
    )
      entry.context = prev.context;
    if (
      !known &&
      !resumed &&
      action === "REPLACE" &&
      prev &&
      (prev.url.split(/[?#]/)[0] === location.pathname ||
        (resourcePath(prev.url) &&
          resourcePath(prev.url) === resourcePath(entry.url)))
    ) {
      Object.assign(entry, { ...prev, url: locationUrl(location), index });
      entry.context = location.state?.resourceNavigation ?? prev.context;
    }
    if (action === "PUSH") {
      for (const key of Object.keys(navigationStore.history))
        if (Number(key) >= index) delete navigationStore.history[Number(key)];
    }
    saveEntry(location, entry);
    previous.current = entry;
    if (!known) refresh();
    const samePage =
      prev?.url.split("?")[0].split("#")[0] === location.pathname;
    const stopRestoring =
      action === "REPLACE" && samePage
        ? () => {}
        : restoreNavigationEntry(entry, location.hash);
    const capture = () => {
      const updated = captureNavigationEntry(currentEntry(location));
      saveEntry(location, updated);
      previous.current = updated;
    };
    // Scrolling a page and its inner containers fires several events per frame; one
    // capture per frame is enough, and an explicit navigation captures on its own.
    let frame = 0;
    const scheduleCapture = () => {
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        capture();
      });
    };
    const leave = () => {
      capture();
      flushNavigation();
    };
    const oldRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.addEventListener("pagehide", leave);
    document.addEventListener("scroll", scheduleCapture, true);
    document.addEventListener("focusin", scheduleCapture);
    return () => {
      stopRestoring();
      cancelAnimationFrame(frame);
      window.history.scrollRestoration = oldRestoration;
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("scroll", scheduleCapture, true);
      document.removeEventListener("focusin", scheduleCapture);
    };
  }, [location, action]);
}
