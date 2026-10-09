import { useEffect } from "react";
import { Link, NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Blocks,
  Building2,
  LayoutDashboard,
  Network,
  Puzzle,
  Users,
  Waypoints,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { usePermissions } from "@/contexts/AuthContext";
import { usePendingAppRequests } from "@/hooks/usePendingAppRequests";
import { internalUrl } from "@/lib/navigation";
import { useFeatureEnabled } from "@/utils/featureFlags";
import { NavBadge, SectionLabel, navLinkClass } from "./SidebarParts";

const GROUPS = ["operations", "integration", "organization"] as const;
type ConfigurationGroup = (typeof GROUPS)[number];

type Access = {
  can: (permission: string) => boolean;
  dashboards: boolean;
  synoptics: boolean;
};

type ConfigurationPage =
  | "dashboards"
  | "synoptics"
  | "automations"
  | "apps"
  | "drivers"
  | "networks"
  | "building"
  | "users";

export type ConfigurationEntry = {
  group: ConfigurationGroup;
  to: string;
  label: `app.${ConfigurationPage}`;
  icon: LucideIcon;
  visible: (access: Access) => boolean;
  /** Carries the pending app registration requests badge. */
  appRequests?: true;
};

/** Every configuration page, in sidebar order. The first one the user may
 *  open is where the Configuration entry leads. */
const CONFIGURATION: readonly ConfigurationEntry[] = [
  {
    group: "operations",
    to: "/dashboards/manage",
    label: "app.dashboards",
    icon: LayoutDashboard,
    visible: (access) => access.dashboards && access.can("dashboards:write"),
  },
  // Authoring plates. A reader meets them through the dashboards' synoptic
  // widgets instead.
  {
    group: "operations",
    to: "/synoptics",
    label: "app.synoptics",
    icon: Waypoints,
    visible: (access) => access.synoptics && access.can("synoptics:write"),
  },
  {
    group: "operations",
    to: "/automations",
    label: "app.automations",
    icon: Zap,
    visible: (access) => access.can("automations:read"),
  },
  // Configuring, enabling and accepting apps is all `users:write`; the route
  // itself stays open, `GET /apps` being readable by any authenticated user.
  {
    group: "integration",
    to: "/apps",
    label: "app.apps",
    icon: Blocks,
    visible: (access) => access.can("users:write"),
    appRequests: true,
  },
  {
    group: "integration",
    to: "/drivers",
    label: "app.drivers",
    icon: Puzzle,
    visible: (access) => access.can("drivers:read"),
  },
  {
    group: "integration",
    to: "/transports",
    label: "app.networks",
    icon: Network,
    visible: (access) => access.can("transports:read"),
  },
  // Same gate as the home page's « Modifier le profil » button.
  {
    group: "organization",
    to: "/profile/edit",
    label: "app.building",
    icon: Building2,
    visible: (access) => access.can("assets:write"),
  },
  {
    group: "organization",
    to: "/users",
    label: "app.users",
    icon: Users,
    visible: (access) => access.can("users:read"),
  },
];

/** On any configuration route the sidebar shows the configuration entries
 *  instead of supervision, whether or not this user may open that page. */
export function isConfigurationPath(pathname: string): boolean {
  return CONFIGURATION.some(
    ({ to }) => pathname === to || pathname.startsWith(`${to}/`),
  );
}

/** The configuration pages this user may open, in sidebar order. */
export function useConfigurationEntries(): ConfigurationEntry[] {
  const can = usePermissions();
  const access = {
    can,
    dashboards: useFeatureEnabled("dashboards"),
    synoptics: useFeatureEnabled("synoptics"),
  };
  return CONFIGURATION.filter((entry) => entry.visible(access));
}

const LAST_SUPERVISION_KEY = "gridone.sidebar.lastSupervision";

function readLastSupervision(): string {
  try {
    return (
      internalUrl(window.sessionStorage.getItem(LAST_SUPERVISION_KEY)) ?? "/"
    );
  } catch {
    return "/";
  }
}

/** Remembers the last supervision page, so leaving configuration goes back
 *  there rather than home. */
export function useRememberSupervision(url: string, inConfiguration: boolean) {
  useEffect(() => {
    if (inConfiguration) return;
    try {
      window.sessionStorage.setItem(LAST_SUPERVISION_KEY, url);
    } catch {
      // Remembering is a convenience; the way back then leads home.
    }
  }, [url, inConfiguration]);
}

/** The sidebar while configuring: a way back to supervision, then the
 *  configuration pages by group. No title: the entries say where we are. */
export function SidebarConfiguration({
  entries,
}: {
  entries: ConfigurationEntry[];
}) {
  const { t } = useTranslation("common");
  const { pendingCount } = usePendingAppRequests();

  return (
    <>
      <Link
        to={readLastSupervision()}
        className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-accent/60 hover:text-foreground lg:min-h-9"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        {t("nav.backToSupervision")}
      </Link>

      {GROUPS.map((group) => {
        const items = entries.filter((entry) => entry.group === group);
        if (items.length === 0) return null;
        return [
          <SectionLabel key={group}>{t(`nav.groups.${group}`)}</SectionLabel>,
          ...items.map((entry) => (
            <NavLink key={entry.to} to={entry.to} className={navLinkClass}>
              <entry.icon className="h-4 w-4" />
              {t(entry.label)}
              {entry.appRequests && pendingCount > 0 && (
                <NavBadge
                  count={pendingCount}
                  label={t("sidebar.appRequestsBadge", { count: pendingCount })}
                />
              )}
            </NavLink>
          )),
        ];
      })}
    </>
  );
}
