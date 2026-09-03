import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
  isGridoneError,
  isNotFound,
  type AggregationOperator,
  type DataType,
  type KpiAttribute,
  type KpiWidgetConfig,
} from "@gridone/sdk";
import { AttributeValue } from "@/components/AttributeValue";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevice } from "@/hooks/useDevice";
import { deviceAttributes, type DeviceType } from "@/lib/devices";
import { fmt } from "@/lib/formatValue";
import { useDashboardPeriod } from "../../useDashboardPeriod";
import { useKpiAggregate } from "./useKpiAggregate";
import { useKpiLiveAggregate } from "./useKpiLiveAggregate";
import { useSpaceAggregate } from "./useSpaceAggregate";
import { isEmptyTarget, type AttributeTarget } from "./useTargetDevices";

const Message: FC<{ children: string }> = ({ children }) => (
  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

const KPI_VALUE_CLASS = "text-3xl font-semibold";

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
      <div className="flex h-full items-center justify-center overflow-hidden p-2">
        <AttributeValue
          value={value}
          attributeName={attribute}
          dataType={dataType}
          deviceType={deviceType}
          className={KPI_VALUE_CLASS}
        />
      </div>
    );
  }
  const digits = precision ?? (dataType === "float" ? 2 : 0);
  return (
    <div className="flex h-full items-center justify-center overflow-hidden p-2">
      <span className={KPI_VALUE_CLASS}>
        {fmt(typeof value === "number" ? value : null, digits)}
        {unit && <span className="text-lg text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
};

/**
 * One or more number rows over device attributes, sharing one Live/Period
 * mode: each attribute's current value, or its value reduced over the whole
 * dashboard period. The tile's grid footprint grows with the attribute
 * count (see the backend's ``content_size_hint``), so rows keep their size.
 */
export const KpiWidgetView: FC<{ config: unknown }> = ({ config }) => {
  const { devices, attributes, temporal } = config as KpiWidgetConfig;

  return (
    <div className="flex h-full flex-col divide-y">
      {attributes.map((attribute, index) => (
        <div key={index} className="min-h-0 flex-1 overflow-hidden py-1">
          <KpiAttributeView
            devices={devices}
            attribute={attribute}
            temporal={temporal}
          />
        </div>
      ))}
    </div>
  );
};

/** One attribute's value, dispatched to the leaf view matching its
 *  space_agg × temporal mode combination. */
const KpiAttributeView: FC<{
  devices: KpiWidgetConfig["devices"];
  attribute: KpiAttribute;
  temporal: KpiWidgetConfig["temporal"];
}> = ({ devices, attribute, temporal }) => {
  const {
    attribute: attributeName,
    space_agg: spaceAgg,
    unit,
    precision,
  } = attribute;
  const target: AttributeTarget = { devices, attribute: attributeName };
  const deviceId = devices.ids?.[0];
  const isPeriod = temporal !== "live" && !!temporal;

  if (spaceAgg) {
    return isPeriod ? (
      <PeriodSpaceKpiView
        target={target}
        agg={temporal.operator}
        spaceAgg={spaceAgg}
        unit={unit}
        precision={precision}
      />
    ) : (
      <LiveSpaceKpiView
        target={target}
        spaceAgg={spaceAgg}
        unit={unit}
        precision={precision}
      />
    );
  }

  if (!isPeriod) {
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

type SpaceErrorMessageKey = "widgets.kpi.noMatch" | "widgets.kpi.noHistory";

/**
 * The message key for a recognized space-aggregate fetch error, shared by
 * the live and period views: the server resolves the target, so 422 always
 * means it matches no device exposing the attribute (or a drifted,
 * mixed-type set). *notFoundKey* names the period view's extra 404 case —
 * no history recorded — which the live view has no equivalent of.
 * `null` means the caller falls back to its own generic error message.
 */
function spaceErrorMessageKey(
  error: unknown,
  notFoundKey?: "widgets.kpi.noHistory",
): SpaceErrorMessageKey | null {
  if (notFoundKey && isNotFound(error)) return notFoundKey;
  if (isGridoneError(error) && error.status === 422)
    return "widgets.kpi.noMatch";
  return null;
}

const LiveSpaceKpiView: FC<{
  target: AttributeTarget;
  spaceAgg: AggregationOperator;
  unit: string | null | undefined;
  precision: number | null | undefined;
}> = ({ target, spaceAgg, unit, precision }) => {
  const { t } = useTranslation("dashboards");
  const { refetchInterval } = useDashboardPeriod();

  const result = useKpiLiveAggregate({ target, spaceAgg, refetchInterval });

  const errorKey = spaceErrorMessageKey(result.error);

  if (isEmptyTarget(target.devices))
    return <Message>{t("widgets.kpi.targetEmpty")}</Message>;
  if (result.isLoading) return <Skeleton className="h-full w-full" />;
  if (errorKey) return <Message>{t(errorKey)}</Message>;
  if (result.error) return <Message>{t("widgets.kpi.error")}</Message>;

  return (
    <KpiValue
      value={result.data?.value}
      dataType={result.data?.data_type}
      attribute={target.attribute}
      unit={unit}
      precision={precision}
    />
  );
};

const PeriodSpaceKpiView: FC<{
  target: AttributeTarget;
  agg: AggregationOperator;
  spaceAgg: AggregationOperator;
  unit: string | null | undefined;
  precision: number | null | undefined;
}> = ({ target, agg, spaceAgg, unit, precision }) => {
  const { t } = useTranslation("dashboards");
  const { query, refetchInterval } = useDashboardPeriod();
  const unbounded = !query.start && !query.last;

  const result = useSpaceAggregate({
    target,
    agg,
    spaceAgg,
    interval: "whole",
    start: query.start,
    end: query.end,
    last: query.last,
    enabled: !unbounded,
    refetchInterval,
  });

  const errorKey = spaceErrorMessageKey(result.error, "widgets.kpi.noHistory");

  if (isEmptyTarget(target.devices))
    return <Message>{t("widgets.kpi.targetEmpty")}</Message>;
  if (unbounded) return <Message>{t("widgets.kpi.unboundedPeriod")}</Message>;
  if (result.isLoading) return <Skeleton className="h-full w-full" />;
  if (errorKey) return <Message>{t(errorKey)}</Message>;
  if (result.error) return <Message>{t("widgets.kpi.error")}</Message>;

  const point = result.data?.points[0];
  return (
    <KpiValue
      value={point?.value}
      dataType={result.data?.aggregation_data_type}
      attribute={target.attribute}
      unit={unit}
      precision={precision}
    />
  );
};
