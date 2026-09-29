import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { Button } from "@/components/ui/button";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { AutomationStatusBadge } from "@/pages/automations/components/AutomationStatusBadge";
import { RuleSentence } from "@/pages/automations/components/RuleSentence";
import { useDeviceAutomations } from "./useDeviceAutomations";

export default function DeviceAutomations() {
  const { t } = useTranslation("devices");
  const { t: tAutomations } = useTranslation("automations");
  const device = useDeviceFromRoute();
  const { data: automations } = useDeviceAutomations(device.id);

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("deviceDetails.automations.title")}
        caption={t("deviceDetails.automations.intro", { device: device.name })}
        actions={
          <Button variant="outline" asChild>
            <Link to="/automations">
              {t("deviceDetails.automations.browse")}
            </Link>
          </Button>
        }
      />
      {!automations.length ? (
        <ResourceEmpty
          resourceName={t("deviceDetails.automations.title")}
          title={t("deviceDetails.automations.emptyTitle")}
          description={t("deviceDetails.automations.emptyDescription")}
        />
      ) : (
        <ul
          aria-label={t("deviceDetails.automations.title")}
          className="divide-y overflow-hidden rounded-xl border bg-card"
        >
          {automations.map((automation) => (
            <li key={automation.id}>
              <Link
                to={`/automations/${encodeURIComponent(automation.id ?? "")}`}
                className="flex items-start gap-3.5 px-5 py-4 hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-semibold">{automation.name}</span>
                    <AutomationStatusBadge
                      enabled={automation.enabled ?? true}
                      deactivation={automation.deactivation}
                    />
                  </div>
                  {automation.description && (
                    <p className="text-sm text-muted-foreground">
                      {automation.description}
                    </p>
                  )}
                  <RuleSentence
                    trigger={automation.trigger}
                    branches={automation.branches}
                  />
                  {automation.deactivation?.reason && (
                    <p className="text-sm text-muted-foreground">
                      {automation.deactivation.source === "circuit_breaker"
                        ? tAutomations(
                            `reasons.${automation.deactivation.reason}`,
                            {
                              defaultValue: automation.deactivation.reason,
                            },
                          )
                        : automation.deactivation.reason}
                    </p>
                  )}
                </div>
                <ChevronRight
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
