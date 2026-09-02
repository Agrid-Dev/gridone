import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AssetType } from "@gridone/sdk";
import {
  useFieldArray,
  useFormState,
  useWatch,
  type Control,
  type FieldArrayPath,
  type FieldValues,
} from "react-hook-form";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, Input } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { InputController } from "@/components/forms/controllers/InputController";
import { messageAtPath } from "@/components/forms/schema-form";
import { useAssetTree } from "@/hooks/useAssetTree";
import { assetNameOf, sortedAssetsOf } from "@/lib/assets";
import { toLabel } from "@/lib/textFormat";
import type { AppSchemaNode } from "@/lib/appConfigSchema";
import { ZoneOverridesAddPicker } from "./ZoneOverridesAddPicker";
import { siblingPath } from "./siblingPath";
import {
  DAYS_OF_WEEK,
  DEFAULT_CHECKIN,
  DEFAULT_CHECKOUT,
  HOTEL_CHECKIN_FIELD,
  HOTEL_CHECKOUT_FIELD,
  HOTEL_WEEKEND_CHECKIN_FIELD,
  HOTEL_WEEKEND_CHECKOUT_FIELD,
  hasOverlap,
  resolveDefaultWindow,
  type HotelDefaults,
} from "./weeklyScheduleWindows";

interface WeeklyScheduleFieldProps {
  /** RHF field path, e.g. `weekly_schedule`. */
  name: string;
  /** Localized schema node for the `weekly_schedule` array property. */
  schema: AppSchemaNode;
  control: Control<FieldValues>;
  required: boolean;
}

const ZONE_FIELD = "zone_id";
const DAY_FIELD = "day_of_week";
const CHECKIN_FIELD = "checkin_time";
const CHECKOUT_FIELD = "checkout_time";
const ZONE_OVERRIDES_FIELD = "zone_overrides";

/** Asset types a schedule row can be keyed on — excludes `org`/`building`/
 *  `floor`, which `assetsList` otherwise mixes in alongside actual rooms. */
const SCHEDULABLE_TYPES = new Set<AssetType>(["room", "zone"]);

type ScheduleRow = Record<string, unknown>;
type OverrideRow = Record<string, unknown>;

/** Purpose-built widget for `weekly_schedule`, mounted through the app-config
 *  override seam ({@link import("./AppConfigField").appConfigOverrides}).
 *
 *  The stored shape is flat — one row per (room, day, window) — same as
 *  `zone_overrides`'s row shape, but here several rows share a room and a
 *  day. This widget groups those flat rows into room -> day -> windows for
 *  display; every edit (toggle a day, add/remove a window, add/remove a
 *  room) still goes through `append`/`remove` on that same flat array, never
 *  a separate nested state synced back onto it. */
export const WeeklyScheduleField: FC<WeeklyScheduleFieldProps> = ({
  name,
  schema,
  control,
  required,
}) => {
  const { t } = useTranslation("apps");
  const [search, setSearch] = useState("");
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const { assetsById, assetsList } = useAssetTree();
  const { errors } = useFormState({ control });

  const { fields, append, remove } = useFieldArray({
    control,
    name: name as FieldArrayPath<FieldValues>,
  });

  // Rooms shown in the table, in the order they were first seen: seeded once
  // from the initial rows, then only "Add room schedule" and "Remove room
  // schedule" change it — a room stays listed even once toggling its days off
  // leaves it with zero rows, since the flat array has no shape for "a room
  // with a schedule but no window" and disappearing mid-edit would be jarring.
  const [knownRoomIds, setKnownRoomIds] = useState<string[]>(() => {
    const seen: string[] = [];
    for (const initialField of fields as unknown as ScheduleRow[]) {
      const zoneId = initialField[ZONE_FIELD] as string | undefined;
      if (zoneId && !seen.includes(zoneId)) seen.push(zoneId);
    }
    return seen;
  });

  const rows = (useWatch({ control, name }) as ScheduleRow[] | undefined) ?? [];

  const zoneOverridesPath = siblingPath(name, ZONE_OVERRIDES_FIELD);
  const zoneOverrides =
    (useWatch({ control, name: zoneOverridesPath }) as
      | OverrideRow[]
      | undefined) ?? [];
  const hotelCheckin =
    (useWatch({ control, name: siblingPath(name, HOTEL_CHECKIN_FIELD) }) as
      | string
      | undefined) || DEFAULT_CHECKIN;
  const hotelCheckout =
    (useWatch({ control, name: siblingPath(name, HOTEL_CHECKOUT_FIELD) }) as
      | string
      | undefined) || DEFAULT_CHECKOUT;
  const hotelWeekendCheckin = useWatch({
    control,
    name: siblingPath(name, HOTEL_WEEKEND_CHECKIN_FIELD),
  }) as string | undefined;
  const hotelWeekendCheckout = useWatch({
    control,
    name: siblingPath(name, HOTEL_WEEKEND_CHECKOUT_FIELD),
  }) as string | undefined;
  const hotelDefaults: HotelDefaults = {
    checkin: hotelCheckin,
    checkout: hotelCheckout,
    weekendCheckin: hotelWeekendCheckin,
    weekendCheckout: hotelWeekendCheckout,
  };

  const overrideOf = (zoneId: string): OverrideRow | undefined =>
    zoneOverrides.find((override) => override[ZONE_FIELD] === zoneId);

  // One pass over the flat array, rather than a fresh scan per day per room:
  // zone_id -> day_of_week -> its row indices.
  const roomDayIndices = new Map<string, Map<string, number[]>>();
  rows.forEach((row, index) => {
    const zoneId = row?.[ZONE_FIELD] as string | undefined;
    const day = row?.[DAY_FIELD] as string | undefined;
    if (!zoneId || !day) return;
    let byDay = roomDayIndices.get(zoneId);
    if (!byDay) {
      byDay = new Map();
      roomDayIndices.set(zoneId, byDay);
    }
    byDay.set(day, [...(byDay.get(day) ?? []), index]);
  });
  const allIndicesFor = (zoneId: string): number[] =>
    [...(roomDayIndices.get(zoneId)?.values() ?? [])].flat();

  const scheduledZoneIds = new Set(knownRoomIds);
  const availableZoneIds = assetsList
    .filter((asset) => SCHEDULABLE_TYPES.has(asset.type))
    .map((asset) => asset.id)
    .filter((zoneId) => !scheduledZoneIds.has(zoneId));
  const availableAssets = sortedAssetsOf(availableZoneIds, assetsById);

  const toggleExpanded = (zoneId: string) =>
    setExpandedRooms((current) => {
      const next = new Set(current);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });

  const addRoom = (zoneId: string) => {
    setKnownRoomIds((current) =>
      current.includes(zoneId) ? current : [...current, zoneId],
    );
    setExpandedRooms((current) => new Set(current).add(zoneId));
  };

  const removeRoom = (zoneId: string) => {
    const indices = allIndicesFor(zoneId);
    if (indices.length > 0) remove(indices);
    setKnownRoomIds((current) => current.filter((id) => id !== zoneId));
  };

  const toggleDay = (zoneId: string, day: string, checked: boolean) => {
    if (checked) {
      const defaults = resolveDefaultWindow(
        day,
        hotelDefaults,
        overrideOf(zoneId),
      );
      append({
        [ZONE_FIELD]: zoneId,
        [DAY_FIELD]: day,
        [CHECKIN_FIELD]: defaults.checkin,
        [CHECKOUT_FIELD]: defaults.checkout,
      });
      return;
    }
    const indices = roomDayIndices.get(zoneId)?.get(day) ?? [];
    if (indices.length > 0) remove(indices);
  };

  const addWindow = (zoneId: string, day: string) => {
    append({
      [ZONE_FIELD]: zoneId,
      [DAY_FIELD]: day,
      [CHECKIN_FIELD]: "",
      [CHECKOUT_FIELD]: "",
    });
  };

  const visibleRoomIds = knownRoomIds.filter((zoneId) =>
    assetNameOf(zoneId, assetsById)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <FieldSet className="min-w-0 gap-3 md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FieldLegend className="mb-0" variant="label">
            {schema.title} {required && <span aria-hidden="true">*</span>}
          </FieldLegend>
          <Badge variant="info" className="tabular-nums">
            {t("weeklySchedule.count", { count: knownRoomIds.length })}
          </Badge>
        </div>
      </div>

      {schema.description && (
        <FieldDescription>{schema.description}</FieldDescription>
      )}
      <FieldError>{messageAtPath(errors, name)}</FieldError>

      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder={t("weeklySchedule.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          className="max-w-xs"
        />
        <ZoneOverridesAddPicker
          candidates={availableAssets}
          assetsById={assetsById}
          onAdd={addRoom}
          addLabel={t("weeklySchedule.add")}
          searchPlaceholder={t("weeklySchedule.searchPlaceholder")}
          noneAvailableLabel={t("weeklySchedule.noneAvailable")}
        />
      </div>

      {knownRoomIds.length === 0 && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {t("weeklySchedule.empty")}
        </div>
      )}
      {knownRoomIds.length > 0 && visibleRoomIds.length === 0 && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {t("weeklySchedule.noResults")}
        </div>
      )}
      {visibleRoomIds.length > 0 && (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>{t("weeklySchedule.columns.room")}</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRoomIds.map((zoneId) => (
              <RoomRows
                key={zoneId}
                zoneName={assetNameOf(zoneId, assetsById)}
                expanded={expandedRooms.has(zoneId)}
                onToggleExpanded={() => toggleExpanded(zoneId)}
                onRemove={() => removeRoom(zoneId)}
                name={name}
                control={control}
                rows={rows}
                fields={fields}
                dayIndices={roomDayIndices.get(zoneId)}
                override={overrideOf(zoneId)}
                hotelDefaults={hotelDefaults}
                onToggleDay={(day, checked) => toggleDay(zoneId, day, checked)}
                onAddWindow={(day) => addWindow(zoneId, day)}
                onRemoveWindow={remove}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </FieldSet>
  );
};

/** One room's summary row plus, when expanded, its 7 day rows. A single
 *  component (rather than the outer widget building both) so the day-level
 *  rendering stays scoped to the room it's for. `dayIndices`, `override` and
 *  `hotelDefaults` are already resolved once per room by the parent, so
 *  looping over the 7 days here does no further scanning of `rows` or
 *  `zone_overrides`. */
const RoomRows: FC<{
  zoneName: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRemove: () => void;
  name: string;
  control: Control<FieldValues>;
  rows: ScheduleRow[];
  fields: { id: string }[];
  dayIndices: Map<string, number[]> | undefined;
  override: OverrideRow | undefined;
  hotelDefaults: HotelDefaults;
  onToggleDay: (day: string, checked: boolean) => void;
  onAddWindow: (day: string) => void;
  onRemoveWindow: (index: number) => void;
}> = ({
  zoneName,
  expanded,
  onToggleExpanded,
  onRemove,
  name,
  control,
  rows,
  fields,
  dayIndices,
  override,
  hotelDefaults,
  onToggleDay,
  onAddWindow,
  onRemoveWindow,
}) => {
  const { t } = useTranslation("apps");

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <button
            type="button"
            className="flex items-center gap-2"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t("weeklySchedule.collapse")
                : t("weeklySchedule.expand")
            }
            onClick={onToggleExpanded}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {zoneName}
          </button>
        </TableCell>
        <TableCell>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("weeklySchedule.remove")}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={2} className="bg-muted/30">
            <div className="flex flex-col gap-3 py-2">
              {DAYS_OF_WEEK.map((day) => {
                const indices = dayIndices?.get(day) ?? [];
                const customized = indices.length > 0;
                const windows: [string, string][] = indices.map((index) => [
                  rows[index]?.[CHECKIN_FIELD] as string,
                  rows[index]?.[CHECKOUT_FIELD] as string,
                ]);
                const overlapping =
                  customized && hasOverlap(windows.filter(([a, b]) => a && b));
                const fallback = resolveDefaultWindow(
                  day,
                  hotelDefaults,
                  override,
                );

                return (
                  <div key={day} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={customized}
                        onCheckedChange={(checked) => onToggleDay(day, checked)}
                        aria-label={toLabel(day)}
                      />
                      <span className="text-sm font-medium">
                        {toLabel(day)}
                      </span>
                      {overlapping && (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {t("weeklySchedule.overlapWarning")}
                        </span>
                      )}
                    </div>

                    {!customized && (
                      <span className="pl-9 text-sm text-muted-foreground">
                        {t("weeklySchedule.usesDefault", {
                          checkin: fallback.checkin,
                          checkout: fallback.checkout,
                        })}
                      </span>
                    )}

                    {customized && (
                      <div className="flex flex-col gap-1.5 pl-9">
                        {indices.map((index) => (
                          <div
                            key={fields[index]?.id ?? index}
                            className="flex items-center gap-2"
                          >
                            <InputController
                              name={`${name}.${index}.${CHECKIN_FIELD}`}
                              control={control}
                              type="time"
                              inputProps={{
                                "aria-label": t("weeklySchedule.checkin"),
                              }}
                            />
                            <span className="text-sm text-muted-foreground">
                              {t("weeklySchedule.windowSeparator")}
                            </span>
                            <InputController
                              name={`${name}.${index}.${CHECKOUT_FIELD}`}
                              control={control}
                              type="time"
                              inputProps={{
                                "aria-label": t("weeklySchedule.checkout"),
                              }}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t("weeklySchedule.removeWindow")}
                              onClick={() => onRemoveWindow(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-fit"
                          onClick={() => onAddWindow(day)}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          {t("weeklySchedule.addWindow")}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};
