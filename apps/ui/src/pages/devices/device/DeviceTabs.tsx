import { type ReactNode } from "react";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Gauge, History, Settings2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPhysicalDevice, isReadOnlyDevice, type Device } from "@/api/devices";

/** Route-linked tab bar for the device frame. Each tab is a NavLink to an
 *  existing device route, so the active tab follows the URL (incl. deep
 *  links and history view modes). Config is physical-only and sits apart on
 *  the right — it's a settings destination, not a content section. */
export function DeviceTabs({ device }: { device: Device }) {
  const { t } = useTranslation("devices");
  const base = `/devices/${device.id}`;

  return (
    <nav
      aria-label={t("deviceDetails.tabs.label")}
      className="flex items-center gap-6 border-b border-border"
    >
      <DeviceTab to={base} end icon={<Gauge className="h-4 w-4" />}>
        {t("deviceDetails.tabs.overview")}
      </DeviceTab>
      <DeviceTab to={`${base}/history`} icon={<History className="h-4 w-4" />}>
        {t("deviceDetails.tabs.history")}
      </DeviceTab>
      {!isReadOnlyDevice(device) && (
        <DeviceTab
          to={`${base}/commands`}
          icon={<Terminal className="h-4 w-4" />}
        >
          {t("deviceDetails.tabs.commands")}
        </DeviceTab>
      )}
      {isPhysicalDevice(device) && (
        <DeviceTab
          to={`${base}/edit`}
          icon={<Settings2 className="h-4 w-4" />}
          className="ml-auto"
        >
          {t("deviceDetails.tabs.config")}
        </DeviceTab>
      )}
    </nav>
  );
}

function DeviceTab({
  to,
  end,
  icon,
  className,
  children,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "relative -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-3 pt-2 text-sm font-medium transition-colors",
          isActive
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
          className,
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}
