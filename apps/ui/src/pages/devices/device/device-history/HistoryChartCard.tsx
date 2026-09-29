import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import TimeSeriesChart, {
  type PanelDragWording,
  type Series,
} from "@/components/charts/TimeSeriesChart";
import { seriesUnit } from "@/components/charts/TimeSeriesChart/seriesUnit";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { useValueLabel } from "@/hooks/useValueLabel";
import { attributeValueLabel } from "@/lib/attributeValueLabel";
import { type MergedRow } from "@/lib/mergeTimeSeries";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

/** One panel's height when several unit panels stack; a lone one gets the
 *  chart's own default. */
const STACKED_LINE_HEIGHT = 220;

function valuesOf<T>(rows: MergedRow[], names: string[]) {
  return Object.fromEntries(
    names.map((name) => [name, rows.map((r) => r.values[name] as T | null)]),
  );
}

/**
 * The chart view: every selected attribute drawn through the shared chart
 * panels — numeric series panelled by unit, booleans and text as state bands
 * — under one cursor that reads all of them at the same instant.
 */
export function HistoryChartCard() {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  const {
    selectedAttributes,
    dataTypes,
    attributes,
    chartRows,
    panelOrder,
    setPanelOrder,
  } = useDeviceHistoryContext();
  const labelFor = useAttributeLabel();
  const booleanLabel = useValueLabel();

  const timestamps = useMemo(
    () => chartRows.map((r) => new Date(r.timestamp)),
    [chartRows],
  );

  const byType = useMemo(() => {
    const of = (type: string) =>
      selectedAttributes.filter((name) => dataTypes[name] === type);
    return {
      float: of("float"),
      int: of("int"),
      bool: of("bool"),
      str: of("str"),
    };
  }, [selectedAttributes, dataTypes]);

  const seriesOf = useMemo(
    () =>
      (name: string): Series => ({
        key: name,
        label: labelFor(name, attributes[name]),
        semanticKey: name,
        unit: attributes[name]?.unit,
      }),
    [labelFor, attributes],
  );

  const lineSeries = useMemo(
    () => byType.float.map(seriesOf),
    [byType, seriesOf],
  );
  const intSeries = useMemo(() => byType.int.map(seriesOf), [byType, seriesOf]);

  const booleanSeries = useMemo(
    () =>
      byType.bool.map((name) => ({
        ...seriesOf(name),
        booleanLabels: {
          true: booleanLabel(true, attributes[name]?.value_labels),
          false: booleanLabel(false, attributes[name]?.value_labels),
        },
      })),
    [byType, seriesOf, booleanLabel, attributes],
  );

  // A text state reads as the supervision pages word it (an HVAC mode
  // "Chauffage" rather than "heat"), for every value the window holds.
  const stringSeries = useMemo(
    () =>
      byType.str.map((name) => {
        const stringLabels: Record<string, string> = {};
        for (const row of chartRows) {
          const value = row.values[name];
          if (typeof value !== "string" || value in stringLabels) continue;
          const label = attributeValueLabel(name, value, tCommon);
          if (label) stringLabels[value] = label;
        }
        return { ...seriesOf(name), stringLabels };
      }),
    [byType, seriesOf, chartRows, tCommon],
  );

  const lineValues = useMemo(
    () => valuesOf<number>(chartRows, byType.float),
    [chartRows, byType],
  );
  const intValues = useMemo(
    () => valuesOf<number>(chartRows, byType.int),
    [chartRows, byType],
  );
  const booleanValues = useMemo(
    () => valuesOf<boolean>(chartRows, byType.bool),
    [chartRows, byType],
  );
  const stringValues = useMemo(
    () => valuesOf<string>(chartRows, byType.str),
    [chartRows, byType],
  );

  const unitPanels = useMemo(
    () => new Set([...lineSeries, ...intSeries].map(seriesUnit)).size,
    [lineSeries, intSeries],
  );

  const dragWording = useMemo<PanelDragWording>(
    () => ({
      instructions: t("history.reorder.instructions"),
      pickedUp: (panel) => t("history.reorder.pickedUp", { panel }),
      movedOver: (panel, over) =>
        t("history.reorder.movedOver", { panel, over }),
      dropped: (panel, over) =>
        over
          ? t("history.reorder.dropped", { panel, over })
          : t("history.reorder.released", { panel }),
      cancelled: (panel) => t("history.reorder.cancelled", { panel }),
    }),
    [t],
  );

  const hasData = chartRows.some((row) =>
    selectedAttributes.some((name) => row.values[name] != null),
  );

  return (
    // The same flat frame as the table view, so the toggle switches views
    // over one surface; the period is named by the range control, not here.
    <div className="rounded-lg border p-4">
      {selectedAttributes.length === 0 ? (
        <p className="flex h-60 items-center justify-center text-sm text-muted-foreground">
          {t("history.noAttributesSelected")}
        </p>
      ) : !hasData ? (
        <p className="flex h-60 items-center justify-center text-sm text-muted-foreground">
          {t("history.noMetricData")}
        </p>
      ) : (
        <TimeSeriesChart
          timestamps={timestamps}
          lineSeries={lineSeries}
          lineValues={lineValues}
          intSeries={intSeries}
          intValues={intValues}
          booleanSeries={booleanSeries}
          booleanValues={booleanValues}
          stringSeries={stringSeries}
          stringValues={stringValues}
          lineHeight={unitPanels > 1 ? STACKED_LINE_HEIGHT : undefined}
          panelOrder={panelOrder}
          onPanelOrderChange={setPanelOrder}
          dragHandleLabel={(panel) => t("history.movePanel", { panel })}
          dragWording={dragWording}
        />
      )}
    </div>
  );
}
