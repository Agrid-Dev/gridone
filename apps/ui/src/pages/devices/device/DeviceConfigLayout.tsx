import { Outlet, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { Settings2, ShieldCheck } from "lucide-react";
import { ResourceNavLink as NavLink } from "@/components/ResourceLink";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { protectionsPath } from "./protections/useProtections";

export default function DeviceConfigLayout() {
  const { t } = useTranslation("devices");
  const device = useDeviceFromRoute();
  const { pathname } = useLocation();
  const base = `/devices/${encodeURIComponent(device.id)}/config`;
  const protections = protectionsPath(device.id);
  const active = pathname.startsWith(protections) ? "protections" : "general";

  return (
    <section className="space-y-6">
      <Tabs value={active} variant="pill">
        <TabsList aria-label={t("deviceDetails.configurationTabs.label")}>
          <TabsTrigger value="general" className="gap-2" asChild>
            <NavLink to={base} end>
              <Settings2 className="h-4 w-4" />
              {t("deviceDetails.configurationTabs.general")}
            </NavLink>
          </TabsTrigger>
          <TabsTrigger value="protections" className="gap-2" asChild>
            <NavLink to={protections}>
              <ShieldCheck className="h-4 w-4" />
              {t("deviceDetails.configurationTabs.protections")}
            </NavLink>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </section>
  );
}
