import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router";
import { TFunction } from "i18next";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toLabel } from "@/lib/textFormat";
import { formatValue } from "@/lib/formatValue";
import type { DeviceCommand } from "@/api/commands";

type Lookups = {
  deviceNames: Record<string, string>;
  userNames: Record<string, string>;
  showDevice?: boolean;
};

export function buildCommandColumns(
  t: TFunction,
  lookups: Lookups,
): ColumnDef<DeviceCommand>[] {
  const { showDevice = true } = lookups;

  return [
    {
      accessorKey: "timestamp",
      header: () => t("common.timestamp"),
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {new Date(row.getValue<string>("timestamp")).toLocaleString()}
        </span>
      ),
    },
    ...(showDevice
      ? [
          {
            accessorKey: "deviceId",
            header: () => t("commands.device"),
            cell: ({ row }: { row: { getValue: <T>(key: string) => T } }) => {
              const deviceId = row.getValue<string>("deviceId");
              return (
                <Link
                  to={`/devices/${deviceId}`}
                  className="text-primary hover:underline"
                >
                  {lookups.deviceNames[deviceId] ?? deviceId}
                </Link>
              );
            },
          } satisfies ColumnDef<DeviceCommand>,
        ]
      : []),
    {
      accessorKey: "attribute",
      header: () => t("commands.attribute"),
      cell: ({ row }) => toLabel(row.getValue<string>("attribute")),
    },
    {
      accessorKey: "value",
      header: () => t("commands.value"),
      cell: ({ row }) => {
        const value = row.original.value;
        const dataType = row.original.dataType;
        return (
          <span className="tabular-nums font-mono">
            {formatValue(value, dataType)}
          </span>
        );
      },
    },
    {
      accessorKey: "userId",
      header: () => t("commands.user"),
      cell: ({ row }) => {
        const uid = row.getValue<string>("userId");
        return lookups.userNames[uid] ?? uid;
      },
    },
    {
      accessorKey: "status",
      header: () => t("commands.status"),
      cell: ({ row }) => {
        const status = row.getValue<"success" | "error">("status");
        const isOk = status === "success";
        return (
          <Badge
            variant="outline"
            className={
              isOk
                ? "border-green-200 text-green-700"
                : "border-red-200 text-red-700"
            }
          >
            {isOk ? (
              <Check className="mr-1 h-3 w-3" />
            ) : (
              <X className="mr-1 h-3 w-3" />
            )}
            {status}
          </Badge>
        );
      },
    },
    {
      accessorKey: "statusDetails",
      header: () => t("commands.details"),
      cell: ({ row }) => {
        const details = row.getValue<string | null>("statusDetails");
        if (!details) return null;
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
