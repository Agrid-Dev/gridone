import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Cpu,
  LogOut,
  Package,
  Radio,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, P } from "@/lib/permissions";

export function Sidebar() {
  const { t } = useTranslation();
  const { state, logout } = useAuth();

  const user = state.status === "authenticated" ? state.user : null;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-slate-900 text-slate-50"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  const canSeeAssets = !user || hasPermission(user, P.ASSETS_READ);
  const canSeeDevices = !user || hasPermission(user, P.DEVICES_READ);
  const canSeeDrivers = !user || hasPermission(user, P.DRIVERS_READ);
  const canSeeTransports = !user || hasPermission(user, P.TRANSPORTS_READ);
  const canSeeUsers = user && hasPermission(user, P.USERS_READ);
  const canSeeRoles = user && hasPermission(user, P.ROLES_READ);

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

        <nav className="flex-1 p-4 space-y-1">
          {canSeeAssets && (
            <NavLink to="/assets" className={linkClass}>
              <Building2 className="h-4 w-4" />
              {t("app.assets")}
            </NavLink>
          )}

          {canSeeDevices && (
            <NavLink to="/devices" className={linkClass}>
              <Cpu className="h-4 w-4" />
              {t("app.devices")}
            </NavLink>
          )}

          {canSeeDrivers && (
            <NavLink to="/drivers" className={linkClass}>
              <Package className="h-4 w-4" />
              {t("app.drivers")}
            </NavLink>
          )}

          {canSeeTransports && (
            <NavLink to="/transports" className={linkClass}>
              <Radio className="h-4 w-4" />
              {t("app.transports")}
            </NavLink>
          )}

          {(canSeeUsers || canSeeRoles) && (
            <hr className="border-slate-100 my-2" />
          )}

          {canSeeUsers && (
            <NavLink to="/users" className={linkClass}>
              <Users className="h-4 w-4" />
              {t("users.title")}
            </NavLink>
          )}

          {canSeeRoles && (
            <NavLink to="/roles" className={linkClass}>
              <Shield className="h-4 w-4" />
              {t("roles.title")}
            </NavLink>
          )}

          <NavLink to="/settings" className={linkClass}>
            <Settings className="h-4 w-4" />
            {t("settings.title")}
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 space-y-3">
          {user && (
            <div className="px-4 text-xs text-slate-500 truncate">
              {user.name || user.username}
            </div>
          )}
          <LanguageSwitcher />
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t("auth.logout")}
          </button>
        </div>
      </div>
    </aside>
  );
}
