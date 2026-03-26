import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/50 p-0.5">
      <button
        onClick={() => changeLanguage("fr")}
        className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
          i18n.language === "fr"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        FR
      </button>
      <button
        onClick={() => changeLanguage("en")}
        className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
          i18n.language === "en"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </button>
    </div>
  );
}
