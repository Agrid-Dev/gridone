import { commandFailureLabel } from "@/lib/commandFailure";
import { CommandConfirmationBadge } from "@/components/CommandConfirmationBadge";
import type { ReactNode } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { TFunction } from "i18next";
import { Check, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AttributeValue } from "@/components/AttributeValue";
import { deviceAttributes } from "@/lib/devices";
import { OTHER_KEY, deviceTypeKey } from "@/lib/deviceTypes";
import type { AttributeFields } from "@/lib/faults";
import type { CommandStatus, Device, UnitCommand } from "@gridone/sdk";

const STATUS_STYLES: Record<CommandStatus, string> = {
  pending: "border-amber-200 text-amber-700",
  success: "border-green-200 text-green-700",
  error: "border-red-200 text-red-700",
};

const STATUS_ICONS: Record<CommandStatus, ReactNode> = {
  pending: <Loader2 className="mr-1 h-3 w-3 animate-spin" />,
  success: <Check className="mr-1 h-3 w-3" />,
  error: <X className="mr-1 h-3 w-3" />,
};

type Lookups = {
  /** Commanded devices by id, for driver-declared labels and value wording. */
  devices: Record<string, Device>;
  /** Display label of an attribute (see `useAttributeLabel`). */
  labelFor: (name: string, attribute?: AttributeFields | null) => string;
  deviceNames: Record<string, string>;
  userNames: Record<string, string>;
  templateNames: Record<string, string>;
  showDevice?: boolean;
  showTemplate?: boolean;
};

export function buildCommandColumns(
  t: TFunction<readonly ["devices", "common"]>,
  lookups: Lookups,
): ColumnDef<UnitCommand>[] {
  const { showDevice = true, showTemplate = true } = lookups;
  const attributeOf = (command: UnitCommand) => {
    const device = lookups.devices[command.device_id];
    return device
      ? (deviceAttributes(device)[command.attribute] as
          | AttributeFields
          | undefined)
      : undefined;
  };

  return [
    {
      accessorKey: "created_at",
      header: () => t("common:common.timestamp"),
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {new Date(row.getValue<string>("created_at")).toLocaleString()}
        </span>
      ),
    },
    ...(showDevice
      ? [
          {
            accessorKey: "device_id",
            header: () => t("commands.device"),
            cell: ({ row }: { row: { getValue: <T>(key: string) => T } }) => {
              const deviceId = row.getValue<string>("device_id");
              return (
                <Link
                  to={`/devices/${deviceId}`}
                  className="text-primary hover:underline"
                >
                  {lookups.deviceNames[deviceId] ?? deviceId}
                </Link>
              );
            },
          } satisfies ColumnDef<UnitCommand>,
        ]
      : []),
    ...(showTemplate
      ? [
          {
            accessorKey: "template_id",
            header: () => t("commands.template"),
            cell: ({ row }: { row: { original: UnitCommand } }) => {
              const { template_id: templateId } = row.original;
              const name = templateId
                ? lookups.templateNames[templateId]
                : null;
              if (!name || !templateId) return null;
              return (
                <Link
                  to={`/devices/commands/templates/${templateId}`}
                  className="text-primary hover:underline"
                >
                  {name}
                </Link>
              );
            },
          } satisfies ColumnDef<UnitCommand>,
        ]
      : []),
    {
      accessorKey: "attribute",
      header: () => t("commands.attribute"),
      cell: ({ row }) =>
        lookups.labelFor(row.original.attribute, attributeOf(row.original)),
    },
    {
      accessorKey: "value",
      header: () => t("commands.value"),
      cell: ({ row }) => {
        const { value, attribute, data_type: dataType } = row.original;
        const device = lookups.devices[row.original.device_id];
        const typeKey = device ? deviceTypeKey(device) : OTHER_KEY;
        return (
          <span className="inline-flex items-center gap-2 tabular-nums">
            <AttributeValue
              value={value}
              attributeName={attribute}
              deviceType={typeKey === OTHER_KEY ? undefined : typeKey}
              dataType={dataType}
              valueLabels={attributeOf(row.original)?.value_labels}
            />
            <CommandConfirmationBadge command={row.original} />
          </span>
        );
      },
    },
    {
      accessorKey: "user_id",
      header: () => t("commands.user"),
      cell: ({ row }) => {
        const uid = row.getValue<string>("user_id");
        return lookups.userNames[uid] ?? uid;
      },
    },
    {
      accessorKey: "status",
      header: () => t("commands.status"),
      cell: ({ row }) => {
        const status = row.getValue<CommandStatus>("status");
        return (
          <Badge variant="outline" className={STATUS_STYLES[status]}>
            {STATUS_ICONS[status]}
            {t(`commands.statusLabels.${status}`)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "status_details",
      header: () => t("commands.details"),
      cell: ({ row }) => {
        const rawDetails = row.getValue<string | null>("status_details");
        if (!rawDetails) return null;
        const details = commandFailureLabel(t, rawDetails);
        return (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="block max-w-[200px] cursor-pointer truncate text-left text-muted-foreground hover:text-foreground"
              >
                {details}
              </button>
            </PopoverTrigger>
            <PopoverContent className="max-w-sm whitespace-pre-wrap break-words text-sm">
              {details}
            </PopoverContent>
          </Popover>
        );
      },
    },
  ];
}
