import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-slate-200 bg-white">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-slate-200 p-6">
          <p className="text-xs font-medium uppercase tracking-[0.4em] text-slate-500">
            {t("app.title")}
          </p>
          <h1 className="mt-1 text-xl font-semibold leading-tight text-slate-900">
            {t("app.subtitle")}
          </h1>
        </div>

        <nav className="flex-1 p-4">
          {["devices", "drivers", "transports"].map((route) => (
            <NavLink
              key={route}
              to={`/${route}`}
              className={({ isActive }) =>
                `block rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-900 text-slate-50"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              {t(`app.${route}`)}
            </NavLink>
          ))}
        </nav>

        {/* Footer with Language Switcher */}
        <div className="border-t border-slate-200 p-4">
          <LanguageSwitcher />
        </div>
      </div>
    </aside>
  );
}
