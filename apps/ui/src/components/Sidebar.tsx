import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Cpu,
  LayoutGrid,
  Network,
  Puzzle,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
  }`;

/** Muted group heading separating the nav into Operations / Configuration /
 *  Administration. Collapses its top spacing when it is the first item. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 first:pt-1">
      {children}
    </p>
  );
}

export function Sidebar() {
  const { t } = useTranslation("common");
  const can = usePermissions();
  const { health } = useAuth();

  const version = health.version?.trim() || null;
  const versionLabel = version ? t("app.version", { version }) : null;

  return (
    <aside className="fixed left-0 top-16 z-30 h-[calc(100vh-4rem)] w-64 border-r border-border bg-sidebar">
      <div className="flex h-full flex-col">
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <SectionLabel>{t("nav.supervision")}</SectionLabel>

          <NavLink to="/devices" className={navLinkClass}>
            <Cpu className="h-4 w-4" />
            {t("app.devices")}
          </NavLink>

          <NavLink to="/assets" className={navLinkClass}>
            <LayoutGrid className="h-4 w-4" />
            {t("app.assets")}
          </NavLink>

          <NavLink to="/automations" className={navLinkClass}>
            <Zap className="h-4 w-4" />
            {t("app.automations")}
          </NavLink>

          <NavLink to="/faults" className={navLinkClass}>
            <TriangleAlert className="h-4 w-4" />
            {t("app.faults")}
          </NavLink>

          <SectionLabel>{t("nav.configuration")}</SectionLabel>

          <NavLink to="/drivers" className={navLinkClass}>
            <Puzzle className="h-4 w-4" />
            {t("app.drivers")}
          </NavLink>

          <NavLink to="/transports" className={navLinkClass}>
            <Network className="h-4 w-4" />
            {t("app.networks")}
          </NavLink>

          {can("users:read") && (
            <>
              <SectionLabel>{t("nav.administration")}</SectionLabel>

              <NavLink to="/users" className={navLinkClass}>
                <Users className="h-4 w-4" />
                {t("app.users")}
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer: product brand + version */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="font-display text-sm font-semibold tracking-wide text-foreground">
            {t("app.title")}
          </span>
          {version && versionLabel && (
            <span
              aria-label={versionLabel}
              className="font-mono text-xs font-medium text-muted-foreground"
              title={versionLabel}
            >
              v{version}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
