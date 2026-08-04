import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Cpu,
  LayoutDashboard,
  LayoutGrid,
  Network,
  Puzzle,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useFaultsList } from "@/hooks/useFaultsList";
import { useFeatureEnabled } from "@/utils/featureFlags";
import { BuildingSwitcher } from "./BuildingSwitcher";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-accent text-accent-foreground"
      : "text-sidebar-foreground hover:bg-accent/60 hover:text-foreground"
  }`;

/** Muted group heading separating the nav into Supervision / Configuration.
 *  Collapses its top spacing when it is the first item. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/70 first:pt-1">
      {children}
    </p>
  );
}

/** Count pill on a nav item, rendered only when the count is non-zero.
 *  `destructive` means "needs attention" (faults); `neutral` is a plain
 *  inventory count (devices). */
function NavBadge({
  count,
  label,
  variant = "destructive",
}: {
  count: number;
  label: string;
  variant?: "destructive" | "neutral";
}) {
  return (
    <span
      aria-label={label}
      className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
        variant === "destructive"
          ? "bg-destructive text-destructive-foreground"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {count}
    </span>
  );
}

export function Sidebar() {
  const { t } = useTranslation("common");
  const can = usePermissions();
  const { health } = useAuth();
  const dashboardsEnabled = useFeatureEnabled("dashboards");
  const { faults } = useFaultsList();
  const { devices } = useDevicesList();

  const version = health.version?.trim() || null;
  const versionLabel = version ? t("app.version", { version }) : null;
  const faultCount = faults.length;
  const deviceCount = devices.length;

  return (
    /* Stacking contract for the shell — sidebar and topbar no longer overlap
     * each other, so they share a level and leave z-50 free:
     *   z-40  Sidebar + TopBar
     *   z-50  RESERVED for Radix portals (dialog, dropdown, popover, tooltip)
     * The topbar used to sit at z-50 and only won against those overlays by
     * DOM order, which is not a contract. */
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-sidebar">
      <div className="flex h-full flex-col">
        <div className="shrink-0 px-4 py-4">
          <Link
            to="/"
            className="font-display text-lg font-semibold tracking-wide text-foreground"
          >
            {t("app.title")}
          </Link>
        </div>

        <div className="shrink-0 px-3 pb-2">
          <BuildingSwitcher />
        </div>

        <nav
          aria-label={t("nav.main")}
          className="flex-1 space-y-0.5 overflow-y-auto p-3"
        >
          <SectionLabel>{t("nav.supervision")}</SectionLabel>

          {dashboardsEnabled && (
            <NavLink to="/dashboards" className={navLinkClass}>
              <LayoutDashboard className="h-4 w-4" />
              {t("app.dashboards")}
            </NavLink>
          )}

          <NavLink to="/devices" className={navLinkClass}>
            <Cpu className="h-4 w-4" />
            {t("app.devices")}
            {deviceCount > 0 && (
              <NavBadge
                variant="neutral"
                count={deviceCount}
                label={t("sidebar.devicesBadge", { count: deviceCount })}
              />
            )}
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
            {faultCount > 0 && (
              <NavBadge
                count={faultCount}
                label={t("sidebar.faultsBadge", { count: faultCount })}
              />
            )}
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
            <NavLink to="/users" className={navLinkClass}>
              <Users className="h-4 w-4" />
              {t("app.users")}
            </NavLink>
          )}
        </nav>

        {/* Footer: version only — the product name is the brand at the top. */}
        {version && versionLabel && (
          <div className="shrink-0 border-t border-border px-4 py-3 text-right">
            <span
              aria-label={versionLabel}
              className="font-mono text-xs font-medium text-muted-foreground"
              title={versionLabel}
            >
              v{version}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
