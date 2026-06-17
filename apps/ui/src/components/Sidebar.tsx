import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Cpu,
  LayoutGrid,
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
          <NavLink to="/devices" className={navLinkClass}>
            <Cpu className="h-4 w-4" />
            {t("app.devices")}
          </NavLink>

          <NavLink to="/assets" className={navLinkClass}>
            <LayoutGrid className="h-4 w-4" />
            {t("app.assets")}
          </NavLink>

          <NavLink to="/drivers" className={navLinkClass}>
            <Puzzle className="h-4 w-4" />
            {t("app.drivers")}
          </NavLink>

          {/* Transports — pending restoration (AGR-742) */}

          <hr className="!my-3 border-border" />

          <NavLink to="/automations" className={navLinkClass}>
            <Zap className="h-4 w-4" />
            {t("app.automations")}
          </NavLink>

          <NavLink to="/faults" className={navLinkClass}>
            <TriangleAlert className="h-4 w-4" />
            {t("app.faults")}
          </NavLink>

          {can("users:read") && (
            <>
              <hr className="!my-3 border-border" />

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
