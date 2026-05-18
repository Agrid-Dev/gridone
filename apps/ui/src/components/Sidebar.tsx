import { Link, NavLink } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Blocks,
  Cpu,
  Puzzle,
  Settings,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import { usePermissions } from "@/contexts/AuthContext";
import { getHealth } from "@/api/health";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
  }`;

export function Sidebar() {
  const { t } = useTranslation("common");
  const can = usePermissions();
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const version = health?.version?.trim() || null;
  const versionLabel = version ? t("app.version", { version }) : null;

  return (
    <aside className="fixed left-0 top-0 z-30 h-screen w-64 border-r border-border bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Brand mark */}
        <Link
          to="/"
          className="block border-b border-border px-4 py-4 transition-colors hover:bg-accent/40"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <span className="font-display text-base font-bold text-primary">
                G
              </span>
            </div>
            <p className="font-display text-base font-bold tracking-wide text-foreground">
              {t("app.title")}
            </p>
          </div>
        </Link>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <NavLink to="/assets" className={navLinkClass}>
            <Building2 className="h-4 w-4" />
            {t("app.assets")}
          </NavLink>

          {(
            [
              { route: "devices", icon: Cpu },
              { route: "drivers", icon: Puzzle },
            ] as const
          ).map(({ route, icon: Icon }) => (
            <NavLink key={route} to={`/${route}`} className={navLinkClass}>
              <Icon className="h-4 w-4" />
              {t(`app.${route}`)}
            </NavLink>
          ))}

          <NavLink to="/apps" className={navLinkClass}>
            <Blocks className="h-4 w-4" />
            {t("app.apps")}
          </NavLink>

          <NavLink to="/automations" className={navLinkClass}>
            <Zap className="h-4 w-4" />
            {t("app.automations")}
          </NavLink>

          <NavLink to="/faults" className={navLinkClass}>
            <TriangleAlert className="h-4 w-4" />
            {t("app.faults")}
          </NavLink>

          <hr className="!my-3 border-border" />

          {can("users:read") && (
            <NavLink to="/users" className={navLinkClass}>
              <Users className="h-4 w-4" />
              {t("app.users")}
            </NavLink>
          )}

          <NavLink to="/settings" className={navLinkClass}>
            <Settings className="h-4 w-4" />
            {t("settings.title")}
          </NavLink>
        </nav>

        {/* Footer: version */}
        {version && versionLabel && (
          <div className="border-t border-border px-4 py-3">
            <p
              aria-label={versionLabel}
              className="text-right font-mono text-xs font-medium text-muted-foreground"
              title={versionLabel}
            >
              v{version}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
