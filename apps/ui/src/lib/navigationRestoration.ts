import type { NavigationEntry } from "./navigation";

function scrollContainers() {
  return Array.from(
    document.querySelectorAll<HTMLElement>("main [data-scroll-restoration]"),
  );
}

function pageLinks() {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>("main a[href]"),
  );
}

/** Only a focused link needs the link list, so a scroll tick never walks the page. */
function focusedLink(link: HTMLAnchorElement) {
  const index = pageLinks().indexOf(link);
  return index < 0 ? undefined : { href: link.getAttribute("href")!, index };
}

export function captureNavigationEntry(
  entry: NavigationEntry,
): NavigationEntry {
  const focused = document.activeElement?.closest<HTMLAnchorElement>("a[href]");
  return {
    ...entry,
    scroll: {
      page: [window.scrollX, window.scrollY],
      containers: Object.fromEntries(
        scrollContainers().map((element, index) => [
          `${element.dataset.scrollRestoration}:${index}`,
          [element.scrollLeft, element.scrollTop],
        ]),
      ),
    },
    focus: (focused && focusedLink(focused)) || entry.focus,
  };
}

/** Retry after asynchronous content renders. Anchors win; restored focus never moves the scroll. */
export function restoreNavigationEntry(entry: NavigationEntry, hash: string) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const restore = () => {
    if (stopped) return;
    if (hash) {
      let id: string;
      try {
        id = decodeURIComponent(hash.slice(1));
      } catch {
        return;
      }
      const target = document.getElementById(id);
      target?.scrollIntoView?.({ block: "start" });
      target?.focus({ preventScroll: true });
      return;
    }
    window.scrollTo(...(entry.scroll?.page ?? [0, 0]));
    for (const [index, element] of scrollContainers().entries()) {
      const position =
        entry.scroll?.containers[
          `${element.dataset.scrollRestoration}:${index}`
        ];
      if (position) {
        element.scrollLeft = position[0];
        element.scrollTop = position[1];
      }
    }
    if (entry.focus) {
      const links = pageLinks();
      const target =
        links.find((link) => link.getAttribute("href") === entry.focus!.href) ??
        links[entry.focus.index] ??
        links[entry.focus.index - 1];
      (
        target ??
        document.querySelector<HTMLElement>("[data-page-title]") ??
        document.getElementById("main-content")
      )?.focus({ preventScroll: true });
    }
  };
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(restore, 30);
  });
  observer.observe(document.getElementById("main-content") ?? document.body, {
    childList: true,
    subtree: true,
  });
  restore();
  const stop = () => {
    stopped = true;
    observer.disconnect();
    clearTimeout(timer);
    window.removeEventListener("pointerdown", stop);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("keydown", stop);
  };
  window.addEventListener("pointerdown", stop, { once: true });
  window.addEventListener("wheel", stop, { once: true });
  window.addEventListener("keydown", stop, { once: true });
  const timeout = setTimeout(stop, 5000);
  return () => {
    stop();
    clearTimeout(timeout);
  };
}
