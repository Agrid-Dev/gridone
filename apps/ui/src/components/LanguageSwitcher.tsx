import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white">
      <button
        onClick={() => changeLanguage("fr")}
        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors rounded-l ${
          i18n.language === "fr"
            ? "bg-slate-900 text-slate-50"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        FR
      </button>
      <button
        onClick={() => changeLanguage("en")}
        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors rounded-r ${
          i18n.language === "en"
            ? "bg-slate-900 text-slate-50"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        EN
      </button>
    </div>
  );
}
