import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { SeverityChip } from "@/components/SeverityChip";
import {
  getConnectionStatus,
  type AttributeKind,
  type Device,
  type DeviceAttribute,
} from "@/api/devices";
import { getAllFaultAttributes, isFaultAttribute } from "@/lib/faults";
import { cn, formatAttributeValue, relativeLastChanged } from "@/lib/utils";
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
 * Read-only Overview body: device attributes grouped into up to three panes
 * (Standard · Faults · Internal). Each pane is a card with a read-only table;
 * writes happen through the command form, not here. Empty panes are not shown.
 */
export function DeviceAttributePanes({ device }: { device: Device }) {
  const { t } = useTranslation("devices");

  const panes = PANES.map((pane) => ({
    ...pane,
    rows: attributesForKind(device, pane.kind),
  })).filter((pane) => pane.rows.length > 0);

  return (
    <div className="space-y-6">
      {panes.map((pane) => (
        <Card key={pane.kind}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t(pane.titleKey)}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">
                    {t("deviceDetails.attributeTable.name")}
                  </TableHead>
                  <TableHead>
                    {t("deviceDetails.attributeTable.type")}
                  </TableHead>
                  <TableHead>
                    {t("deviceDetails.attributeTable.mode")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("deviceDetails.attributeTable.value")}
                  </TableHead>
                  <TableHead className="pr-6 text-right">
                    {t("deviceDetails.attributeTable.updated")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pane.rows.map((attribute) => (
                  <AttributeRow
                    key={attribute.name}
                    device={device}
                    attribute={attribute}
                  />
                ))}
              </TableBody>
            </Table>
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
  attribute: DeviceAttribute;
}) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");

  const isWritable = attribute.readWriteModes.includes("write");
  const fault = isFaultAttribute(attribute) ? attribute : null;
  const isFaulty = fault?.isFaulty ?? false;

  return (
    <TableRow
      data-faulty={isFaulty || undefined}
      className={cn(isFaulty && "bg-destructive/5")}
    >
      <TableCell className="pl-6 font-medium">
        <div className="flex items-center gap-2">
          {isFaulty && fault && <SeverityChip severity={fault.severity} />}
          <span>{toLabel(attribute.name)}</span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {attribute.dataType}
      </TableCell>
      <TableCell>
        <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {isWritable
            ? t("deviceDetails.attributeTable.readWrite")
            : t("deviceDetails.attributeTable.readOnly")}
        </span>
      </TableCell>
      <TableCell className="text-right font-mono">
        {attribute.name === CONNECTION_STATUS_ATTR ? (
          <ConnectionStatusBadge status={getConnectionStatus(device)} />
        ) : (
          formatAttributeValue(attribute.currentValue)
        )}
      </TableCell>
      <TableCell className="pr-6 text-right text-xs text-muted-foreground">
        {attribute.lastUpdated
          ? relativeLastChanged(attribute.lastUpdated, tCommon)
          : "—"}
      </TableCell>
    </TableRow>
  );
}
