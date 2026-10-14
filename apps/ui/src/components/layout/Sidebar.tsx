import { Link, NavLink, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  Cpu,
  LayoutGrid,
  Settings,
  TriangleAlert,
} from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useFaultsList } from "@/hooks/useFaultsList";
import { usePendingAppRequests } from "@/hooks/usePendingAppRequests";
import { locationUrl } from "@/lib/navigation";
import { useFeatureEnabled } from "@/utils/featureFlags";
import { BuildingSwitcher } from "./BuildingSwitcher";
import {
  SidebarConfiguration,
  isConfigurationPath,
  useConfigurationEntries,
  useRememberSupervision,
} from "./SidebarConfiguration";
import { SidebarDashboards } from "./SidebarDashboards";
import { NavBadge, navLinkClass } from "./SidebarParts";

const DOCS_URL = "https://docs.gridone.a-grid.com/";

export function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation("common");
  const { health } = useAuth();
  const location = useLocation();
  const inConfiguration = isConfigurationPath(location.pathname);
  useRememberSupervision(locationUrl(location), inConfiguration);
  const configuration = useConfigurationEntries();

  const version = health.version?.trim() || null;
  const versionLabel = version ? t("app.version", { version }) : null;

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

        {/* Supervision, or the configuration pages while one is open: the
         *  sidebar swaps rather than stacking both, so the operator's views
         *  keep the whole rail. Supervision reaches configuration through a
         *  single entry pinned to the bottom. */}
        <nav
          aria-label={t("nav.main")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {inConfiguration ? (
              <SidebarConfiguration entries={configuration} />
            ) : (
              <SupervisionEntries />
            )}
          </div>

          {!inConfiguration && configuration.length > 0 && (
            <div className="shrink-0 border-t border-border px-3 pb-1 pt-2">
              <ConfigurationEntry to={configuration[0].to} />
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

/** The operator's views: the dashboards first, as the structure arranges
 *  them, then the building's devices, zones and faults. */
function SupervisionEntries() {
  const { t } = useTranslation("common");
  const can = usePermissions();
  const dashboardsEnabled = useFeatureEnabled("dashboards");
  const { faults } = useFaultsList();
  const { devices } = useDevicesList();
  const faultCount = faults.length;
  const deviceCount = devices.length;

  return (
    <>
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
    </>
  );
}

/** The way into configuration, opening its first page. Pending app requests
 *  surface here, since the Apps entry is out of sight from supervision. */
function ConfigurationEntry({ to }: { to: string }) {
  const { t } = useTranslation("common");
  const { pendingCount } = usePendingAppRequests();
  return (
    <Link to={to} className={navLinkClass({ isActive: false })}>
      <Settings className="h-4 w-4" />
      {t("nav.configuration")}
      {pendingCount > 0 ? (
        <NavBadge
          count={pendingCount}
          label={t("sidebar.appRequestsBadge", { count: pendingCount })}
        />
      ) : (
        <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
      )}
    </Link>
  );
}
