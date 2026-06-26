import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { SeverityChip } from "@/components/SeverityChip";
import {
  getConnectionStatus,
  type AttributeKind,
  type Device,
  type DeviceAttribute,
} from "@/api/devices";
import { getAllFaultAttributes, isFaultAttribute } from "@/lib/faults";
import { compactTimeAgo, formatAttributeValue } from "@/lib/utils";
import { toLabel } from "@/lib/textFormat";

/** Attribute name carrying the device connection status (internal kind). */
const CONNECTION_STATUS_ATTR = "connectionStatus";

/** The attribute kinds rendered as panes, in display order. A pane with no
 *  rows is skipped (see {@link DeviceAttributePanes}). */
const PANES = [
  { kind: "standard", titleKey: "deviceDetails.panes.standard" },
  { kind: "fault", titleKey: "deviceDetails.panes.faults" },
  { kind: "internal", titleKey: "deviceDetails.panes.internal" },
] as const satisfies readonly { kind: AttributeKind; titleKey: string }[];

/** Attributes of a kind, ordered for display: faults reuse the shared
 *  active-first / severity ordering; other kinds sort by their human label. */
function attributesForKind(
  device: Device,
  kind: AttributeKind,
): DeviceAttribute[] {
  if (kind === "fault") return getAllFaultAttributes(device);
  return Object.values(device.attributes)
    .filter((attr) => attr.kind === kind)
    .sort((a, b) => toLabel(a.name).localeCompare(toLabel(b.name)));
}

/**
 * Read-only Overview body: device attributes grouped into up to three sections
 * (Standard · Faults · Internal). Each row is a compact name + value; the type,
 * access mode and timestamps live in an on-hover details tooltip. Writes happen
 * through the command form, not here. Empty sections are not shown.
 */
export function DeviceAttributePanes({ device }: { device: Device }) {
  const { t } = useTranslation("devices");

  const panes = PANES.map((pane) => ({
    ...pane,
    rows: attributesForKind(device, pane.kind),
  })).filter((pane) => pane.rows.length > 0);

  return (
    <div className="space-y-8">
      {panes.map((pane) => (
        <section key={pane.kind} className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(pane.titleKey)}
          </h3>
          <div>
            {pane.rows.map((attribute) => (
              <AttributeRow
                key={attribute.name}
                device={device}
                attribute={attribute}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AttributeRow({
  device,
  attribute,
}: {
  device: Device;
  attribute: DeviceAttribute;
}) {
  const { t } = useTranslation("devices");

  const fault = isFaultAttribute(attribute) ? attribute : null;
  const isFaulty = fault?.isFaulty ?? false;
  const isWritable = attribute.readWriteModes.includes("write");
  const changedAgo = compactTimeAgo(attribute.lastChanged);
  const syncedAgo = compactTimeAgo(attribute.lastUpdated);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-attribute={attribute.name}
          data-faulty={isFaulty || undefined}
          className="flex w-fit max-w-full cursor-help items-center gap-2 rounded py-1 text-sm"
        >
          {isFaulty && fault && <SeverityChip severity={fault.severity} />}
          <span className="text-muted-foreground">
            {toLabel(attribute.name)}
          </span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            {attribute.name === CONNECTION_STATUS_ATTR ? (
              <ConnectionStatusBadge status={getConnectionStatus(device)} />
            ) : (
              formatAttributeValue(attribute.currentValue)
            )}
          </span>
          {changedAgo && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span
                aria-hidden
                className="h-1 w-1 rounded-full bg-muted-foreground/60"
              />
              {changedAgo}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent className="space-y-1">
        <DetailRow
          label={t("deviceDetails.attributeDetails.type")}
          value={attribute.dataType}
          mono
        />
        <DetailRow
          label={t("deviceDetails.attributeDetails.access")}
          value={
            isWritable
              ? t("deviceDetails.attributeDetails.readWrite")
              : t("deviceDetails.attributeDetails.readOnly")
          }
        />
        <DetailRow
          label={t("deviceDetails.attributeDetails.synced")}
          value={syncedAgo || "—"}
          mono
        />
        <DetailRow
          label={t("deviceDetails.attributeDetails.changed")}
          value={changedAgo || "—"}
          mono
        />
      </TooltipContent>
    </Tooltip>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-6 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono tabular-nums" : undefined}>
        {value}
      </span>
    </div>
  );
}
