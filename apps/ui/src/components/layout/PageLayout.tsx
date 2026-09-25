import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type PageLayout = {
  fullBleed: boolean;
  /** The page takes the whole window: no sidebar, no top bar. */
  focused: boolean;
  setFullBleed: (fullBleed: boolean) => void;
  setFocused: (focused: boolean) => void;
};

const PageLayoutContext = createContext<PageLayout>({
  fullBleed: false,
  focused: false,
  setFullBleed: () => {},
  setFocused: () => {},
});

export function PageLayoutProvider({ children }: { children: ReactNode }) {
  const [fullBleed, setFullBleed] = useState(false);
  const [focused, setFocused] = useState(false);
  const value = useMemo(
    () => ({ fullBleed, focused, setFullBleed, setFocused }),
    [fullBleed, focused],
  );
  return (
    <PageLayoutContext.Provider value={value}>
      {children}
    </PageLayoutContext.Provider>
  );
}

/** How the current page asked to be laid out. */
export function usePageLayout() {
  const { fullBleed, focused } = useContext(PageLayoutContext);
  return { fullBleed, focused };
}

/** The column every page sits in: centred and padded, unless the page asked
 *  for the whole content area. */
export function PageContainer({ children }: { children: ReactNode }) {
  const { fullBleed, focused } = useContext(PageLayoutContext);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        !fullBleed && !focused && "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8",
      )}
    >
      {children}
    </div>
  );
}

/**
 * Give the current page the whole content area while it is mounted — for a
 * canvas that needs every pixel. A layout effect, so the padded column never
 * paints first.
 */
export function useFullBleedPage() {
  const { setFullBleed } = useContext(PageLayoutContext);
  useLayoutEffect(() => {
    setFullBleed(true);
    return () => setFullBleed(false);
  }, [setFullBleed]);
}

/**
 * Give the current page the whole window while it is mounted: the shell's
 * sidebar and top bar step aside, as for an editor that brings its own
 * way back. Implies the whole content area, with no padding.
 */
export function useFocusedPage() {
  const { setFocused } = useContext(PageLayoutContext);
  useLayoutEffect(() => {
    setFocused(true);
    return () => setFocused(false);
  }, [setFocused]);
}
