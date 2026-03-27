import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = "gridone-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return "system";
  });

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (next === "system") {
      localStorage.removeItem(STORAGE_KEY);
      applyClass(getSystemDark());
    } else {
      localStorage.setItem(STORAGE_KEY, next);
      applyClass(next === "dark");
    }
  }, []);

  // Apply on mount + listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    // Initial apply (in case React mounts after the blocking script already ran)
    if (theme === "system") {
      applyClass(mq.matches);
    } else {
      applyClass(theme === "dark");
    }

    const handler = (e: MediaQueryListEvent) => {
      if (theme === "system") applyClass(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
