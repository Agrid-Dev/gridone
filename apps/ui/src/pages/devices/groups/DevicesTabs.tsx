import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function DevicesTabs() {
  const { t } = useTranslation("devices");
  return (
    <nav aria-label={t("devices.title")} className="flex gap-5 border-b">
      {[
        ["/devices", t("devices.title")],
        ["/devices/groups", t("groups.title")],
      ].map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            cn(
              "border-b-2 px-1 pb-3 text-sm font-medium",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground",
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
