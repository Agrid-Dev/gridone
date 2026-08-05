import { useTranslation } from "react-i18next";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/formatValue";
import type { AwhpDevice } from "@/lib/devices";
import { readAwhpAttributes } from "@/lib/devices";
import { cycleMedia } from "./cycleMedia";
import { formatRunHours, type ChilledWaterKpis } from "./chilledWaterKpis";
import { useAwhpChilledWaterHistory } from "./useAwhpChilledWaterHistory";

/** KPI strip under the chart. A KPI whose backing metric the device does not
 *  record is null and simply not rendered; the strip disappears entirely
 *  when none is computable. */
function KpiFooter({ kpis }: { kpis: ChilledWaterKpis }) {
  const { t } = useTranslation("devices");

  const entries = [
    kpis.meanDeviation != null && {
      label: t("controls.awhp.avgDeviation"),
      value: fmt(kpis.meanDeviation, 1, " °C"),
    },
    kpis.runSeconds != null && {
      label: t("controls.awhp.runHours"),
      value: formatRunHours(kpis.runSeconds),
    },
    kpis.energyKwh != null && {
      label: t("controls.awhp.energy24h"),
      value: fmt(kpis.energyKwh, 0, " kWh"),
    },
  ].filter((e): e is { label: string; value: string } => Boolean(e));

  if (entries.length === 0) return null;

  return (
    <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
      {entries.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </dt>
          <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "Eau glacée — dernières 24 h": outlet water temperature as a solid line
 *  and the setpoint as a dashed step line, with the computable KPIs below.
 *  A unit heating its water gets the mode-neutral "water" title. */
export function AwhpChilledWaterCard({ device }: { device: AwhpDevice }) {
  const { t } = useTranslation("devices");
  const { timestamps, values, kpis, isLoading, hasData } =
    useAwhpChilledWaterHistory(device.id);

  const heating =
    cycleMedia(readAwhpAttributes(device).mode).condenser === "water";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {heating
            ? t("controls.awhp.waterLast24h")
            : t("controls.awhp.chilledWaterLast24h")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-60 w-full" />
        ) : !hasData ? (
          <p className="flex h-60 items-center justify-center text-sm text-muted-foreground">
            {t("controls.awhp.noWaterHistory")}
          </p>
        ) : (
          <>
            <TimeSeriesChart
              timestamps={timestamps}
              lineSeries={[
                {
                  key: "outlet_temperature",
                  label: t("controls.awhp.outlet"),
                },
              ]}
              lineValues={{ outlet_temperature: values.outlet_temperature }}
              intSeries={[
                {
                  key: "setpoint_temperature",
                  label: t("controls.awhp.setpoint"),
                  dash: true,
                },
              ]}
              intValues={{ setpoint_temperature: values.setpoint_temperature }}
            />
            <KpiFooter kpis={kpis} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
