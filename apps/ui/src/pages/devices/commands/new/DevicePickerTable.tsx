import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import type { Device } from "@/api/devices";

type DevicePickerTableProps = {
  devices: Device[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function DevicePickerTable({
  devices,
  selectedIds,
  onChange,
}: DevicePickerTableProps) {
  const { t } = useTranslation("devices");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const visibleAllSelected =
    devices.length > 0 && devices.every((d) => selectedSet.has(d.id));
  const visibleSomeSelected =
    devices.some((d) => selectedSet.has(d.id)) && !visibleAllSelected;

  const toggleOne = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const toggleVisible = () => {
    const next = new Set(selectedSet);
    if (visibleAllSelected) devices.forEach((d) => next.delete(d.id));
    else devices.forEach((d) => next.add(d.id));
    onChange(Array.from(next));
  };

  return (
    <div className="overflow-hidden rounded-lg border max-h-80 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={visibleAllSelected}
                ref={(el) => {
                  if (el) el.indeterminate = visibleSomeSelected;
                }}
                onChange={toggleVisible}
                aria-label={t("commands.new.toggleVisible")}
                className="h-4 w-4"
              />
            </TableHead>
            <TableHead>{t("commands.device")}</TableHead>
            <TableHead>{t("devices.fields.type")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                {t("commands.new.noDevicesMatch")}
              </TableCell>
            </TableRow>
          ) : (
            devices.map((d) => {
              const checked = selectedSet.has(d.id);
              return (
                <TableRow
                  key={d.id}
                  onClick={() => toggleOne(d.id)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(d.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={d.name || d.id}
                      className="h-4 w-4"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {d.name || d.id}
                  </TableCell>
                  <TableCell>
                    {d.type ? (
                      <DeviceTypeChip type={d.type} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
