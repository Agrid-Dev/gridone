import { useMemo, type ReactNode } from "react";
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
import type { Device } from "@gridone/sdk";
import { cn } from "@/lib/utils";

type DevicePickerTableProps = {
  devices: Device[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /**
   * Ids listed after the devices although no device has them — e.g. a stored
   * selection whose device was deleted — so that they are seen, and can be
   * unticked, rather than kept or dropped unseen. The header box counts them
   * like any row. An id that one of `devices` has is listed once, as that
   * device.
   */
  missingIds?: string[];
  /** Row label of a missing id; the id itself by default. */
  missingLabel?: (id: string) => string;
  /** Shown when there is no row; defaults to the filter wording. */
  emptyMessage?: string;
  className?: string;
};

const NO_IDS: string[] = [];
const byId = (id: string) => id;

export function DevicePickerTable({
  devices,
  selectedIds,
  onChange,
  missingIds = NO_IDS,
  missingLabel = byId,
  emptyMessage,
  className,
}: DevicePickerTableProps) {
  const { t } = useTranslation("devices");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const missingRows = useMemo(() => {
    const listed = new Set(devices.map((d) => d.id));
    return [...new Set(missingIds)].filter((id) => !listed.has(id));
  }, [devices, missingIds]);
  const rowIds = useMemo(
    () => [...devices.map((d) => d.id), ...missingRows],
    [devices, missingRows],
  );

  const visibleAllSelected =
    rowIds.length > 0 && rowIds.every((id) => selectedSet.has(id));
  const visibleSomeSelected =
    rowIds.some((id) => selectedSet.has(id)) && !visibleAllSelected;

  const toggleOne = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const toggleVisible = () => {
    const next = new Set(selectedSet);
    if (visibleAllSelected) rowIds.forEach((id) => next.delete(id));
    else rowIds.forEach((id) => next.add(id));
    onChange(Array.from(next));
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card max-h-80 overflow-y-auto",
        className,
      )}
    >
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
                className="h-4 w-4 cursor-pointer accent-primary"
              />
            </TableHead>
            <TableHead>{t("commands.device")}</TableHead>
            <TableHead>{t("devices.fields.type")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowIds.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                {emptyMessage ?? t("commands.new.noDevicesMatch")}
              </TableCell>
            </TableRow>
          ) : (
            <>
              {devices.map((d) => (
                <SelectableRow
                  key={d.id}
                  label={d.name || d.id}
                  checked={selectedSet.has(d.id)}
                  onToggle={() => toggleOne(d.id)}
                >
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
                </SelectableRow>
              ))}
              {missingRows.map((id) => (
                <SelectableRow
                  key={id}
                  label={missingLabel(id)}
                  checked={selectedSet.has(id)}
                  onToggle={() => toggleOne(id)}
                >
                  <TableCell className="text-muted-foreground">
                    {missingLabel(id)}
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">—</span>
                  </TableCell>
                </SelectableRow>
              ))}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/** A row the whole of which toggles its checkbox. */
function SelectableRow({
  label,
  checked,
  onToggle,
  children,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <TableRow
      onClick={onToggle}
      data-state={checked ? "selected" : undefined}
      className="cursor-pointer data-[state=selected]:bg-primary/5"
    >
      <TableCell>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          aria-label={label}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </TableCell>
      {children}
    </TableRow>
  );
}
