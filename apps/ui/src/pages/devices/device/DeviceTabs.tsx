import { useLocation } from "react-router";
import {
  ResourceLink as Link,
  ResourceNavLink as NavLink,
} from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import {
  Gauge,
  History,
  Settings2,
  ShieldCheck,
  Terminal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Device } from "@gridone/sdk";
import { operatingRulesPath } from "./operating-rules/useOperatingRules";
import {
  deviceConfigPath,
  devicePath,
  deviceSection,
  isConfigSection,
  type DeviceSection,
} from "./deviceSections";

type TabLink = {
  section: DeviceSection;
  to: string;
  /** Match the path exactly: the section's own path prefixes its siblings'. */
  end?: boolean;
  Icon: LucideIcon;
  label: string;
};

/** Route-linked tab bar for the device frame, in one of two modes. Supervision
 *  shows the device at work; configuration swaps the same row for its own
 *  sections, so the page never stacks two rows of tabs. The outline button at
 *  the right end switches mode — a button, not a tab, because it replaces the
 *  whole row rather than selecting within it.
 *
 *  Uses the shared underline Tabs styling, but each trigger is a NavLink
 *  (`asChild`) so tabs are real links (deep-links, open-in-new-tab) and the
 *  active tab is derived from the URL. */
export function DeviceTabs({ device }: { device: Device }) {
  const { t } = useTranslation("devices");
  const { pathname } = useLocation();
  const active = deviceSection(pathname, device.id);
  const base = devicePath(device.id);
  const config = deviceConfigPath(device.id);
  const configuring = isConfigSection(active);

  const tabs: TabLink[] = configuring
    ? [
        {
          section: "general",
          to: config,
          end: true,
          Icon: Settings2,
          label: t("deviceDetails.configurationTabs.general"),
        },
        {
          section: "operatingRules",
          to: operatingRulesPath(device.id),
          Icon: ShieldCheck,
          label: t("deviceDetails.configurationTabs.operatingRules"),
        },
        {
          section: "automations",
          to: `${config}/automations`,
          Icon: Zap,
          label: t("deviceDetails.configurationTabs.automations"),
        },
      ]
    : [
        {
          section: "overview",
          to: base,
          end: true,
          Icon: Gauge,
          label: t("deviceDetails.tabs.overview"),
        },
        {
          section: "history",
          to: `${base}/history`,
          Icon: History,
          label: t("deviceDetails.tabs.history"),
        },
        {
          section: "commands",
          to: `${base}/commands`,
          Icon: Terminal,
          label: t("deviceDetails.tabs.commands"),
        },
      ];

  return (
    <div className="flex items-center gap-4 border-b border-border">
      <Tabs value={active} className="min-w-0">
        <TabsList
          aria-label={
            configuring
              ? t("deviceDetails.configurationTabs.label")
              : t("deviceDetails.tabs.label")
          }
          className="border-b-0"
        >
          {tabs.map(({ section, to, end, Icon, label }) => (
            <TabsTrigger
              key={section}
              value={section}
              className="gap-2"
              asChild
            >
              <NavLink to={to} end={end}>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* mb-1.5 lifts the button onto the labels' centre line: each trigger
          carries its padding and underline below the text. */}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="mb-1.5 ml-auto h-8"
      >
        {configuring ? (
          <Link to={base}>
            <Gauge />
            {t("deviceDetails.tabs.overview")}
          </Link>
        ) : (
          <Link to={config}>
            <Settings2 />
            {t("deviceDetails.tabs.config")}
          </Link>
        )}
      </Button>
    </div>
  );
}
