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
  setFullBleed: (fullBleed: boolean) => void;
};

const PageLayoutContext = createContext<PageLayout>({
  fullBleed: false,
  setFullBleed: () => {},
});

export function PageLayoutProvider({ children }: { children: ReactNode }) {
  const [fullBleed, setFullBleed] = useState(false);
  const value = useMemo(() => ({ fullBleed, setFullBleed }), [fullBleed]);
  return (
    <PageLayoutContext.Provider value={value}>
      {children}
    </PageLayoutContext.Provider>
  );
}

/** The column every page sits in: centred and padded, unless the page asked
 *  for the whole content area. */
export function PageContainer({ children }: { children: ReactNode }) {
  const { fullBleed } = useContext(PageLayoutContext);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        !fullBleed && "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8",
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
