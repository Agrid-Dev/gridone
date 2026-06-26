import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { AttributeValue } from "@/components/AttributeValue";
import { ConnectionStatusValue } from "@/components/ConnectionStatusBadge";
import { SeverityChip } from "@/components/SeverityChip";
import {
  getConnectionStatus,
  type AttributeKind,
  type Device,
  type DeviceAttribute,
} from "@/api/devices";
import { getAllFaultAttributes, isFaultAttribute } from "@/lib/faults";
import { cn, compactTimeAgo } from "@/lib/utils";
import { toLabel } from "@/lib/textFormat";

/** Map key (camelCased by the API client) of the connection-status attribute.
 *  We identify it by object identity against `device.attributes`, not by
 *  `attribute.name` — that field keeps the backend's snake_case value. */
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
 * (Standard · Faults · Internal), laid out in a multi-column list. Each row is a
 * compact name + value; type, access mode and timestamps live in an on-hover
 * details tooltip. Writes happen through the command form, not here. Empty
 * sections are not shown.
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
          <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(pane.titleKey)}
          </h3>
          <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 lg:grid-cols-2">
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
  const isConnectionStatus =
    device.attributes[CONNECTION_STATUS_ATTR] === attribute;
  const isWritable = attribute.readWriteModes.includes("write");
  const changedAgo = compactTimeAgo(attribute.lastChanged);
  const syncedAgo = compactTimeAgo(attribute.lastUpdated);

  // Writable rows deep-link into the command form, pre-targeted to this device
  // and attribute; the user only supplies the value (the table stays read-only).
  const commandHref = `/devices/${device.id}/commands/new?attribute=${encodeURIComponent(
    attribute.name,
  )}`;

  const rowClassName = cn(
    "flex w-fit min-w-0 max-w-full items-center gap-2 text-sm",
    isWritable ? "cursor-pointer" : "cursor-help",
  );

  const rowContent: ReactNode = (
    <>
      {isFaulty && fault && <SeverityChip severity={fault.severity} />}
      <span className="min-w-0 truncate text-muted-foreground">
        {toLabel(attribute.name)}
      </span>
      <span className="shrink-0 font-medium text-foreground">
        {isConnectionStatus ? (
          <ConnectionStatusValue status={getConnectionStatus(device)} />
        ) : (
          <AttributeValue
            value={attribute.currentValue}
            attributeName={attribute.name}
            deviceType={device.type ?? undefined}
            dataType={attribute.dataType}
            fault={
              fault
                ? { severity: fault.severity, isFaulty: fault.isFaulty }
                : undefined
            }
          />
        )}
      </span>
      {changedAgo && (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <span
            aria-hidden
            className="h-1 w-1 rounded-full bg-muted-foreground/60"
          />
          {changedAgo}
        </span>
      )}
    </>
  );

  return (
    <div className="rounded px-2 py-1 transition-colors hover:bg-muted">
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          {isWritable ? (
            <Link
              to={commandHref}
              data-attribute={attribute.name}
              data-faulty={isFaulty || undefined}
              className={rowClassName}
            >
              {rowContent}
            </Link>
          ) : (
            <div
              data-attribute={attribute.name}
              data-faulty={isFaulty || undefined}
              className={rowClassName}
            >
              {rowContent}
            </div>
          )}
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          sideOffset={8}
          className="space-y-1"
        >
          <p className="font-medium text-foreground">
            {toLabel(attribute.name)}
          </p>
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
          {isWritable && (
            <p className="mt-1 flex items-center gap-1.5 border-t border-border pt-1.5 text-xs italic text-primary">
              <Terminal className="h-3 w-3 shrink-0 not-italic" aria-hidden />
              {t("deviceDetails.attributeDetails.action")}
            </p>
          )}
          <TooltipArrow className="fill-popover" />
        </TooltipContent>
      </Tooltip>
    </div>
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
