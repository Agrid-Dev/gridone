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
import { fmt } from "@/lib/formatValue";
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
      <div className="flex h-full items-center justify-center p-4">
        <AttributeValue
          value={value}
          attributeName={attribute}
          dataType={dataType}
          deviceType={deviceType}
          className="text-3xl font-semibold"
        />
      </div>
    );
  }
  const digits = precision ?? (dataType === "float" ? 2 : 0);
  return (
    <div className="flex h-full items-center justify-center p-4">
      <span className="text-3xl font-semibold">
        {fmt(typeof value === "number" ? value : null, digits)}
        {unit && (
          <span className="ml-1 text-lg text-muted-foreground">{unit}</span>
        )}
      </span>
    </div>
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
  // The aggregate endpoint 404s both for a device deleted after save and for
  // an attribute with no recorded history; only checked once the aggregate
  // itself 404s, to avoid an extra request on the common path.
  const { error: deviceError, isLoading: deviceLoading } = useDevice(
    isNotFound(result.error) ? deviceId : undefined,
  );

  if (!deviceId) return <Message>{t("widgets.kpi.targetEmpty")}</Message>;
  if (!agg) return <Message>{t("widgets.kpi.noOperator")}</Message>;
  if (unbounded) return <Message>{t("widgets.kpi.unboundedPeriod")}</Message>;
  if (result.isLoading) return <Skeleton className="h-full w-full" />;
  if (isNotFound(result.error)) {
    if (deviceLoading) return <Skeleton className="h-full w-full" />;
    return (
      <Message>
        {isNotFound(deviceError)
          ? t("widgets.kpi.notFound")
          : t("widgets.kpi.noHistory")}
      </Message>
    );
  }
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
