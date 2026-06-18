import { NavLink, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { Gauge, History, Settings2, Terminal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isPhysicalDevice, type Device } from "@/api/devices";

/** Route-linked tab bar for the device frame. Uses the shared underline Tabs
 *  styling, but each trigger is a NavLink (`asChild`) so tabs are real links
 *  (deep-links, open-in-new-tab) and the active tab is derived from the URL.
 *  Config is physical-only and sits apart on the right — a settings
 *  destination, not a content section. */
export function DeviceTabs({ device }: { device: Device }) {
  const { t } = useTranslation("devices");
  const { pathname } = useLocation();
  const base = `/devices/${device.id}`;

  const active = pathname.startsWith(`${base}/history`)
    ? "history"
    : pathname.startsWith(`${base}/commands`)
      ? "commands"
      : pathname.startsWith(`${base}/edit`)
        ? "config"
        : "overview";

  return (
    <Tabs value={active}>
      <TabsList aria-label={t("deviceDetails.tabs.label")} className="w-full">
        <TabsTrigger value="overview" className="gap-2" asChild>
          <NavLink to={base} end>
            <Gauge className="h-4 w-4" />
            {t("deviceDetails.tabs.overview")}
          </NavLink>
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-2" asChild>
          <NavLink to={`${base}/history`}>
            <History className="h-4 w-4" />
            {t("deviceDetails.tabs.history")}
          </NavLink>
        </TabsTrigger>
        <TabsTrigger value="commands" className="gap-2" asChild>
          <NavLink to={`${base}/commands`}>
            <Terminal className="h-4 w-4" />
            {t("deviceDetails.tabs.commands")}
          </NavLink>
        </TabsTrigger>
        {isPhysicalDevice(device) && (
          <TabsTrigger value="config" className="ml-auto gap-2" asChild>
            <NavLink to={`${base}/edit`}>
              <Settings2 className="h-4 w-4" />
              {t("deviceDetails.tabs.config")}
            </NavLink>
          </TabsTrigger>
        )}
      </TabsList>
    </Tabs>
  );
}
