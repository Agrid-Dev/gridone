import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Blocks,
  Cpu,
  LayoutDashboard,
  LayoutGrid,
  Network,
  Puzzle,
  TriangleAlert,
  Users,
  Waypoints,
  Zap,
} from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useFaultsList } from "@/hooks/useFaultsList";
import { usePendingAppRequests } from "@/hooks/usePendingAppRequests";
import { useFeatureEnabled } from "@/utils/featureFlags";
import { BuildingSwitcher } from "./BuildingSwitcher";
import { SidebarDashboards } from "./SidebarDashboards";

const DOCS_URL = "https://docs.gridone.a-grid.com/";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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

export function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation("common");
  const can = usePermissions();
  const { health } = useAuth();
  const dashboardsEnabled = useFeatureEnabled("dashboards");
  const synopticsEnabled = useFeatureEnabled("synoptics");
  // Under Configuration: the entry is for authoring plates. A reader meets
  // them through the dashboards' synoptic widgets instead.
  const showSynoptics = synopticsEnabled && can("synoptics:write");
  const showDashboardsConfig = dashboardsEnabled && can("dashboards:write");
  const { faults } = useFaultsList();
  const { devices } = useDevicesList();
  const { pendingCount: pendingAppRequests } = usePendingAppRequests();

  const hasConfiguration =
    showDashboardsConfig ||
    showSynoptics ||
    can("automations:read") ||
    can("users:write") ||
    can("drivers:read") ||
    can("transports:read") ||
    can("users:read");

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
    <aside
      onClick={(event) => {
        if (
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey &&
          (event.target as HTMLElement).closest("a[href]")
        )
          onNavigate?.();
      }}
      className={
        mobile
          ? "h-full w-full"
          : "fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-border bg-sidebar lg:block"
      }
    >
      <div className="flex h-full flex-col">
        {/* The building owns the header slot: from the operator's chair the
         *  site is the product. The Gridone brand lives in the footer. The
         *  slot is the topbar's height with the same bottom border, so the
         *  divider runs unbroken across the whole chrome. On mobile the
         *  drawer's close button sits in the top-right corner, so the block
         *  keeps clear of it. */}
        <div
          className={`flex h-16 shrink-0 items-stretch border-b border-border ${mobile ? "pr-14" : ""}`}
        >
          <BuildingSwitcher />
        </div>

        {/* Two groups: Supervision at the top, Configuration pushed to the
         *  bottom so the operator's views stay in reach and the integrator's
         *  tools sit by the footer. When the nav overflows, the groups stack
         *  and scroll together. */}
        <nav
          aria-label={t("nav.main")}
          className="flex flex-1 flex-col overflow-y-auto p-3"
        >
          <div className="space-y-0.5">
            <SectionLabel>{t("nav.supervision")}</SectionLabel>

            {dashboardsEnabled && <SidebarDashboards />}

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

            {can("assets:read") && (
              <NavLink to="/assets" className={navLinkClass}>
                <LayoutGrid className="h-4 w-4" />
                {t("app.assets")}
              </NavLink>
            )}

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
          </div>

          {hasConfiguration && (
            <div className="mt-auto space-y-0.5 pt-4">
              <SectionLabel>{t("nav.configuration")}</SectionLabel>

              {/* Managing the list of dashboards (the Supervision entries above)
               *  is integrator work: create, rename, delete, reorder. */}
              {showDashboardsConfig && (
                <NavLink to="/dashboards/manage" className={navLinkClass}>
                  <LayoutDashboard className="h-4 w-4" />
                  {t("app.dashboards")}
                </NavLink>
              )}

              {showSynoptics && (
                <NavLink to="/synoptics" className={navLinkClass}>
                  <Waypoints className="h-4 w-4" />
                  {t("app.synoptics")}
                </NavLink>
              )}

              {/* Automations are integration work (rules wired by the
               *  integrator), not a view the operator supervises. */}
              {can("automations:read") && (
                <NavLink to="/automations" className={navLinkClass}>
                  <Zap className="h-4 w-4" />
                  {t("app.automations")}
                </NavLink>
              )}

              {/* Above Drivers: an app is the product-level integration, drivers
               *  and networks are the plumbing underneath it. Admin-only, because
               *  configuring, enabling and accepting apps is all `users:write` —
               *  the route itself stays open, `GET /apps` being readable by any
               *  authenticated user. */}
              {can("users:write") && (
                <NavLink to="/apps" className={navLinkClass}>
                  <Blocks className="h-4 w-4" />
                  {t("app.apps")}
                  {pendingAppRequests > 0 && (
                    <NavBadge
                      count={pendingAppRequests}
                      label={t("sidebar.appRequestsBadge", {
                        count: pendingAppRequests,
                      })}
                    />
                  )}
                </NavLink>
              )}

              {can("drivers:read") && (
                <NavLink to="/drivers" className={navLinkClass}>
                  <Puzzle className="h-4 w-4" />
                  {t("app.drivers")}
                </NavLink>
              )}

              {can("transports:read") && (
                <NavLink to="/transports" className={navLinkClass}>
                  <Network className="h-4 w-4" />
                  {t("app.networks")}
                </NavLink>
              )}

              {can("users:read") && (
                <NavLink to="/users" className={navLinkClass}>
                  <Users className="h-4 w-4" />
                  {t("app.users")}
                </NavLink>
              )}
            </div>
          )}
        </nav>

        {/* Footer: the "powered by" line. The wordmark echoes the login
         *  page's tracked small caps and opens the product docs; the version
         *  sits on the same row so the two read as one about-line. */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-3">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="font-display text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("app.title")}
          </a>
          {version && versionLabel && (
            <span
              aria-label={versionLabel}
              className="text-xs font-medium text-muted-foreground"
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
