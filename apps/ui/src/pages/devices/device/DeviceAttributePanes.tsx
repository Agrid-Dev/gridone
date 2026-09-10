import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { AttributeValue } from "@/components/AttributeValue";
import { ConnectionStatusValue } from "@/components/ConnectionStatusBadge";
import { SeverityChip } from "@/components/SeverityChip";
import type { AttributeKind, Device } from "@gridone/sdk";
import {
  deviceAttributes,
  getConnectionStatus,
  type DeviceType,
} from "@/lib/devices";
import {
  getAllFaultAttributes,
  isFaultAttribute,
  type AttributeFields,
} from "@/lib/faults";
import { attributeUnit } from "@/lib/attributeUnits";
import { localize } from "@/lib/localizedText";
import { cn, compactTimeAgo } from "@/lib/utils";
import { toLabel } from "@/lib/textFormat";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";

/** Wire-format map key of the connection-status attribute. We identify it by
 *  object identity against the device's attribute map, not by
 *  `attribute.name`. */
const CONNECTION_STATUS_ATTR = "connection_status";

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
): AttributeFields[] {
  if (kind === "fault") return getAllFaultAttributes(device);
  return (Object.values(deviceAttributes(device)) as AttributeFields[])
    .filter((attr) => attr.kind === kind)
    .sort((a, b) => toLabel(a.name).localeCompare(toLabel(b.name)));
}

/**
 * Rows of a pane split by the `group` their driver declares: ungrouped
 * rows first, then one sub-section per group in first-seen order. Faults
 * keep their severity ordering and are never regrouped.
 */
function groupRows(
  kind: AttributeKind,
  rows: AttributeFields[],
): { group: string | null; rows: AttributeFields[] }[] {
  if (kind === "fault") return [{ group: null, rows }];
  const groups = new Map<string | null, AttributeFields[]>([[null, []]]);
  for (const row of rows) {
    const group = row.group ?? null;
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }
  return Array.from(groups.entries())
    .filter(([, groupRows]) => groupRows.length > 0)
    .map(([group, groupRows]) => ({ group, rows: groupRows }));
}

/**
 * Read-only Overview body: device attributes grouped into up to three sections
 * (Standard · Faults · Internal), laid out in a multi-column list. Each row is a
 * compact name + value; type, access mode and timestamps live in an on-hover
 * details tooltip. Writes happen through the command form, not here. Empty
 * sections are not shown.
 */
export function DeviceAttributePanes({
  device,
  group,
}: {
  device: Device;
  group?: string;
}) {
  const { t } = useTranslation("devices");

  const panes = PANES.map((pane) => ({
    ...pane,
    rows: attributesForKind(device, pane.kind).filter(
      (attribute) => group === undefined || attribute.group === group,
    ),
  })).filter((pane) => pane.rows.length > 0);

  return (
    <div className="space-y-6">
      {panes.map((pane) => (
        <Card key={pane.kind}>
          <CardHeader>
            <CardTitle>{t(pane.titleKey)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {groupRows(pane.kind, pane.rows).map(({ group, rows }) => (
              <section
                key={group ?? ""}
                data-attribute-group={group ?? undefined}
              >
                {group && (
                  <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {toLabel(group)}
                  </h4>
                )}
                <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 lg:grid-cols-2">
                  {rows.map((attribute) => (
                    <AttributeRow
                      key={attribute.name}
                      device={device}
                      attribute={attribute}
                    />
                  ))}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AttributeRow({
  device,
  attribute,
}: {
  device: Device;
  attribute: AttributeFields;
}) {
  const { t, i18n } = useTranslation("devices");
  const labelFor = useAttributeLabel();
  const label = labelFor(attribute.name, attribute);
  const description = attribute.description
    ? localize(attribute.description, i18n.language)
    : null;

  const fault = isFaultAttribute(attribute) ? attribute : null;
  const isFaulty = fault?.is_faulty ?? false;
  const isConnectionStatus =
    deviceAttributes(device)[CONNECTION_STATUS_ATTR] === attribute;
  const isWritable = attribute.read_write_modes.includes("write");
  const changedAgo = compactTimeAgo(attribute.last_changed);
  const syncedAgo = compactTimeAgo(attribute.last_updated);

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
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-medium text-foreground">
        {isConnectionStatus ? (
          <ConnectionStatusValue status={getConnectionStatus(device)} />
        ) : (
          <AttributeValue
            value={attribute.current_value}
            attributeName={attribute.name}
            deviceType={(device.type ?? undefined) as DeviceType | undefined}
            dataType={attribute.data_type}
            unit={
              attribute.unit ? attributeUnit(attribute.name, attribute) : null
            }
            fault={
              fault
                ? { severity: fault.severity, isFaulty: fault.is_faulty }
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
          <p className="font-medium text-foreground">{label}</p>
          {description && (
            <p className="max-w-64 text-xs text-muted-foreground">
              {description}
            </p>
          )}
          <DetailRow
            label={t("deviceDetails.attributeDetails.type")}
            value={attribute.data_type}
            tabular
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
            tabular
          />
          <DetailRow
            label={t("deviceDetails.attributeDetails.changed")}
            value={changedAgo || "—"}
            tabular
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
  tabular,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="flex justify-between gap-6 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={tabular ? "tabular-nums" : undefined}>{value}</span>
    </div>
  );
}
