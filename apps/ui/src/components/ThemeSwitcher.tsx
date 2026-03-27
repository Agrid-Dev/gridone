import { Sun, Monitor, Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";

const options = [
  { value: "light" as const, icon: Sun, labelKey: "appearance.light" },
  { value: "system" as const, icon: Monitor, labelKey: "appearance.system" },
  { value: "dark" as const, icon: Moon, labelKey: "appearance.dark" },
];

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {t("appearance.theme")}
      </p>
      <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/50 p-0.5">
        {options.map(({ value, icon: Icon, labelKey }) => (
          <button
            key={value}
            title={t(labelKey)}
            onClick={() => setTheme(value)}
            className={`flex flex-1 items-center justify-center rounded px-3 py-1.5 transition-colors ${
              theme === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
