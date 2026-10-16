import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceNavLink as NavLink } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/contexts/AuthContext";
import { useFaultsList } from "@/hooks/useFaultsList";

export const FAULTS_PATH = "/faults";
export const FAULT_HISTORY_PATH = "/faults/history";

type FaultsHeaderProps = {
  caption: ReactNode;
  actions?: ReactNode;
  /** Controls at the right end of the tab row, for the tab on screen. */
  aside?: ReactNode;
};

/** The alerts page's header over its two tabs: the alerts ongoing, counted,
 *  and their history. The history is rebuilt from the devices' recorded
 *  series, so a role that cannot read them keeps the ongoing list alone.
 *
 *  Each tab is a NavLink (`asChild`), as on the device page: a real link the
 *  active tab is derived from. */
export function FaultsHeader({ caption, actions, aside }: FaultsHeaderProps) {
  const { t } = useTranslation("faults");
  const { pathname } = useLocation();
  const can = usePermissions();
  const { faults } = useFaultsList();

  if (!can("timeseries:read")) {
    return (
      <ResourceHeader
        title={t("faults.title")}
        caption={caption}
        actions={actions}
      />
    );
  }

  const active = pathname.startsWith(FAULT_HISTORY_PATH) ? "history" : "live";
  return (
    <div className="space-y-4">
      <ResourceHeader
        title={t("faults.title")}
        caption={caption}
        actions={actions}
        flush
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border">
        <Tabs value={active} className="min-w-0">
          <TabsList aria-label={t("faults.tabs.label")} className="border-b-0">
            <TabsTrigger value="live" className="gap-2" asChild>
              <NavLink to={FAULTS_PATH} end>
                {t("faults.tabs.live")}
                {faults.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-error/10 px-1.5 text-xs font-semibold tabular-nums text-status-error">
                    {faults.length}
                  </span>
                )}
              </NavLink>
            </TabsTrigger>
            <TabsTrigger value="history" asChild>
              <NavLink to={FAULT_HISTORY_PATH}>
                {t("faults.tabs.history")}
              </NavLink>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {aside && (
          // mb-1.5 lifts the controls onto the labels' centre line: each
          // trigger carries its padding and underline below the text.
          <div className="mb-1.5 ml-auto flex items-center gap-2">{aside}</div>
        )}
      </div>
    </div>
  );
}
