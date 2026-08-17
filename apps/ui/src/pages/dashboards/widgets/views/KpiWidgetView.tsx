import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
  isNotFound,
  type AggregationOperator,
  type DataType,
  type KpiWidgetConfig,
} from "@gridone/sdk";
import { AttributeValue } from "@/components/AttributeValue";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevice } from "@/hooks/useDevice";
import { deviceAttributes, type DeviceType } from "@/lib/devices";
import { useDashboardPeriod } from "../../useDashboardPeriod";
import { useKpiAggregate } from "./useKpiAggregate";

const Message: FC<{ children: string }> = ({ children }) => (
  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

/** Renders the tile's value: bool/str show their label, numbers apply the
 *  config's precision and unit override. */
const KpiValue: FC<{
  value: string | number | boolean | null | undefined;
  dataType: DataType | undefined;
  attribute: string;
  deviceType?: DeviceType;
  unit: string | null | undefined;
  precision: number | null | undefined;
}> = ({ value, dataType, attribute, deviceType, unit, precision }) => {
  if (dataType === "bool" || dataType === "str") {
    return (
      <AttributeValue
        value={value}
        attributeName={attribute}
        dataType={dataType}
        deviceType={deviceType}
        className="text-3xl font-semibold"
      />
    );
  }
  const digits = precision ?? (dataType === "float" ? 2 : 0);
  const text = typeof value === "number" ? value.toFixed(digits) : "—";
  return (
    <span className="text-3xl font-semibold">
      {text}
      {unit && (
        <span className="ml-1 text-lg text-muted-foreground">{unit}</span>
      )}
    </span>
  );
};

/**
 * Single-number tile over one device attribute: the current value, or one
 * value reduced over the whole dashboard period.
 */
export const KpiWidgetView: FC<{ config: unknown }> = ({ config }) => {
  const { target, temporal, unit, precision } = config as KpiWidgetConfig;
  const deviceId = target.devices.ids?.[0];
  if (temporal === "live" || !temporal) {
    return (
      <LiveKpiView
        deviceId={deviceId}
        attribute={target.attribute}
        unit={unit}
        precision={precision}
      />
    );
  }
  return (
    <PeriodKpiView
      deviceId={deviceId}
      attribute={target.attribute}
      agg={temporal.operator}
      unit={unit}
      precision={precision}
    />
  );
};

const LiveKpiView: FC<{
  deviceId: string | undefined;
  attribute: string;
  unit: string | null | undefined;
  precision: number | null | undefined;
}> = ({ deviceId, attribute, unit, precision }) => {
  const { t } = useTranslation("dashboards");
  const { data: device, isLoading, error } = useDevice(deviceId);

  if (!deviceId) return <Message>{t("widgets.kpi.targetEmpty")}</Message>;
  if (isLoading) return <Skeleton className="h-full w-full" />;
  if (isNotFound(error)) return <Message>{t("widgets.kpi.notFound")}</Message>;
  if (error) return <Message>{t("widgets.kpi.error")}</Message>;

  const attr = device ? deviceAttributes(device)[attribute] : undefined;
  if (!attr) return <Message>{t("widgets.kpi.attributeMissing")}</Message>;

  return (
    <KpiValue
      value={attr.current_value as string | number | boolean | null}
      dataType={attr.data_type as DataType | undefined}
      attribute={attribute}
      deviceType={device?.type as DeviceType | undefined}
      unit={unit}
      precision={precision}
    />
  );
};

const PeriodKpiView: FC<{
  deviceId: string | undefined;
  attribute: string;
  agg: AggregationOperator | undefined;
  unit: string | null | undefined;
  precision: number | null | undefined;
}> = ({ deviceId, attribute, agg, unit, precision }) => {
  const { t } = useTranslation("dashboards");
  const { query, refetchInterval } = useDashboardPeriod();
  const unbounded = !query.start && !query.last;

  const result = useKpiAggregate({
    deviceId,
    attribute,
    agg,
    start: query.start,
    end: query.end,
    last: query.last,
    enabled: !unbounded,
    refetchInterval,
  });

  if (!deviceId) return <Message>{t("widgets.kpi.targetEmpty")}</Message>;
  if (!agg) return <Message>{t("widgets.kpi.noOperator")}</Message>;
  if (unbounded) return <Message>{t("widgets.kpi.unboundedPeriod")}</Message>;
  if (result.isLoading) return <Skeleton className="h-full w-full" />;
  // A 404 here means no history is recorded for this attribute — the device
  // itself was already confirmed to exist by the target picker at save time.
  if (isNotFound(result.error))
    return <Message>{t("widgets.kpi.noHistory")}</Message>;
  if (result.error) return <Message>{t("widgets.kpi.error")}</Message>;

  const point = result.data?.points[0];
  return (
    <KpiValue
      value={point?.value}
      dataType={result.data?.aggregation_data_type}
      attribute={attribute}
      unit={unit}
      precision={precision}
    />
  );
};
