import { useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { isNotFound, type Device, type SymbolElement } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { SILENT_TEXT } from "@/components/synoptic/Chip";
import { headName, headOf } from "@/components/synoptic/heads";
import {
  READING_INK_TEXT,
  readingInk,
  readingState,
  SILENT_READING,
  symbolSlotKey,
  type ReadingTarget,
  type SlotReading,
  type SynopticValues,
} from "@/components/synoptic/values";
import type { WriteOutcome } from "@/components/device-ui/runtime/controlRuntime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/contexts/AuthContext";
import { useAttributeWriter } from "@/hooks/useAttributeCommandRuntime";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { useDeviceById } from "@/hooks/useDeviceById";
import {
  deviceAttributes,
  isAttributeWritable,
  type AttributeValue,
} from "@/lib/devices";
import { valueLabelText } from "@/lib/attributeValueLabel";
import { getHighestActiveSeverity, type AttributeFields } from "@/lib/faults";
import { cn } from "@/lib/utils";
import { SeverityLabel } from "@/pages/faults/components/SeverityLabel";
import type { PageVocabulary } from "./usePlateVocabulary";

/** One point of the symbol: a slot its type declares, bound in the
 *  document, and what it reads. `attribute` names the device attribute
 *  behind a live binding; a literal has none. */
type Point = {
  slot: string;
  attribute: string | null;
  reading: SlotReading;
};

/** The bound slots among `slots`, the ones the opened machine reads, in
 *  the order its type declares them. */
function pointsOf(
  symbol: SymbolElement,
  slots: string[],
  values: SynopticValues,
): Point[] {
  return slots.flatMap((slot) => {
    const binding = symbol.bindings?.[slot];
    if (!binding) return [];
    const reading =
      binding.kind === "text"
        ? { ...SILENT_READING, text: binding.text, literal: true }
        : (values.slots[symbolSlotKey(symbol.id, slot)] ?? SILENT_READING);
    return [
      {
        slot,
        attribute:
          binding.kind === "attribute" ? binding.target.attribute : null,
        reading,
      },
    ];
  });
}

/** What the popover opens on: a machine (a symbol, or one head of a twin)
 *  or a reading of the plate. */
export type PopoverSubject =
  | {
      symbol: SymbolElement;
      /** The head opened, on a symbol of several machines; its device and
       *  its points alone. */
      head?: string | null;
      reading?: never;
    }
  | {
      /** A reading opened on the plate: the device it comes from, and that
       *  reading alone. */
      reading: ReadingTarget;
      symbol?: never;
      head?: never;
    };

type DevicePopoverProps = PopoverSubject & {
  values: SynopticValues;
  vocabulary: PageVocabulary;
  onClose: () => void;
};

/** The classes of each popover: a machine's points, or one reading's value
 *  on a line each, in small type. */
const SIZE = {
  machine: {
    box: "w-72 gap-3 p-3 text-sm",
    title: "truncate",
    close: "h-7 w-7",
    closeIcon: "h-4 w-4",
    placeholder: "h-16",
    row: "py-1.5",
    caption: "text-xs",
    link: "text-sm",
    linkIcon: "h-3.5 w-3.5",
  },
  reading: {
    box: "w-56 gap-1 p-2 text-xs",
    title: "break-words",
    close: "h-5 w-5",
    closeIcon: "h-3 w-3",
    placeholder: "h-8",
    row: "py-0.5",
    caption: "text-[10px]",
    link: "text-xs",
    linkIcon: "h-3 w-3",
  },
} as const;
type PopoverSize = (typeof SIZE)[keyof typeof SIZE];

/** The reading's device as the plate reads it now, so the popover follows a
 *  filter that resolves elsewhere; the one clicked while no value has come
 *  (the editor's preview reads none). */
const readingDeviceId = (reading: ReadingTarget, values: SynopticValues) => {
  const live = values.slots[reading.key];
  return live ? live.deviceId : reading.deviceId;
};

/**
 * What a click on a device symbol opens, on the plate: the device's name
 * and a link to its page, and the symbol's own points (the slots the
 * document binds) with their live readings. A point whose attribute the
 * device lets one write is edited here, by a user allowed to command
 * devices, through the same preflight and consent as the device page. A
 * click on a reading opens the device it comes from with that reading
 * alone, read only: it asks where the number comes from. Nothing else of
 * the device is shown: the plate names what matters, the device page has
 * the rest.
 */
export const DevicePopover: FC<DevicePopoverProps> = ({
  symbol,
  head = null,
  reading,
  values,
  vocabulary,
  onClose,
}) => {
  const { t } = useTranslation("synoptics");
  const { t: tCommon } = useTranslation();
  const machine = symbol ? headOf(symbol, head) : null;
  const deviceId = reading
    ? readingDeviceId(reading, values)
    : (machine?.deviceId ?? undefined);
  const result = useDeviceById(deviceId);
  const device = result.data;
  const points: Point[] = reading
    ? [
        {
          slot: reading.key,
          attribute: reading.attribute,
          reading: values.slots[reading.key] ?? SILENT_READING,
        },
      ]
    : symbol
      ? pointsOf(symbol, machine?.slots ?? [], values)
      : [];
  const size = SIZE[reading ? "reading" : "machine"];
  // A reading has no label of its own: its title waits for the device's
  // name rather than flashing the id.
  const name =
    symbol?.label ?? device?.name ?? (result.isLoading ? null : deviceId);

  return (
    <div
      aria-label={t("popover.label")}
      className={cn("flex flex-col", size.box)}
      data-device-popover={symbol?.id ?? reading?.key}
      data-head={head ?? undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={cn("font-semibold text-foreground", size.title)}>
            {name == null ? (
              <Skeleton className="h-3 w-24" />
            ) : head ? (
              `${name} · ${headName(head)}`
            ) : (
              name
            )}
          </div>
          {symbol && (
            <div className="text-xs text-muted-foreground">
              {device?.name && device.name !== symbol.label
                ? device.name
                : vocabulary.typeLabel(symbol.type)}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {device?.is_faulty && (
            <SeverityLabel
              severity={getHighestActiveSeverity(device) ?? "alert"}
              className="text-xs"
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={size.close}
            onClick={onClose}
            aria-label={t("popover.close")}
          >
            <X className={size.closeIcon} />
          </Button>
        </div>
      </div>
      {result.isLoading ? (
        <Skeleton className={cn("w-full", size.placeholder)} />
      ) : result.error || !device ? (
        <p className="text-muted-foreground">
          {isNotFound(result.error)
            ? tCommon("common.deviceNotFound")
            : tCommon("common.deviceLoadError")}
        </p>
      ) : (
        <PointList
          device={device}
          points={points}
          vocabulary={vocabulary}
          size={size}
          editable={!reading}
        />
      )}
      {deviceId && (
        <Link
          to={`/devices/${deviceId}`}
          className={cn(
            "flex items-center gap-1 font-medium text-primary hover:underline focus-visible:underline",
            size.link,
          )}
        >
          {t("popover.open")}
          <ArrowUpRight className={size.linkIcon} />
        </Link>
      )}
    </div>
  );
};

const PointList: FC<{
  device: Device;
  points: Point[];
  vocabulary: PageVocabulary;
  size: PopoverSize;
  /** Whether a writable point offers its editor: a machine's do, a
   *  reading's does not. */
  editable: boolean;
}> = ({ device, points, vocabulary, size, editable }) => {
  const { t, i18n } = useTranslation("synoptics");
  const labelFor = useAttributeLabel();
  const can = usePermissions();
  const [editing, setEditing] = useState<string | null>(null);
  if (points.length === 0) {
    return <p className="text-muted-foreground">{t("popover.noPoints")}</p>;
  }
  const attributes = deviceAttributes(device);
  return (
    <dl className="divide-y divide-border">
      {points.map((point) => {
        const attribute = point.attribute
          ? (attributes[point.attribute] as AttributeFields | undefined)
          : undefined;
        const writable =
          editable &&
          !!point.attribute &&
          isAttributeWritable(device, point.attribute) &&
          can("devices:command");
        const state = readingState(point.reading);
        return (
          <div
            key={point.slot}
            data-point={point.slot}
            className={cn("flex flex-col gap-1", size.row)}
          >
            <div className="flex items-center justify-between gap-3">
              <dt
                className={cn(
                  "font-semibold uppercase tracking-wide text-muted-foreground",
                  size.caption,
                )}
              >
                {point.attribute
                  ? labelFor(point.attribute, attribute)
                  : vocabulary.slotLabel(point.slot)}
              </dt>
              <dd className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-semibold",
                    !point.reading.word && "tabular-nums",
                    READING_INK_TEXT[readingInk(state, point.reading.word)],
                    state === "note" && "font-normal italic",
                  )}
                  data-reading={state}
                >
                  {point.reading.text ?? SILENT_TEXT}
                  {point.reading.unit && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      {point.reading.unit}
                    </span>
                  )}
                </span>
                {state !== "note" && (
                  <span
                    className="text-[11px] tabular-nums text-muted-foreground"
                    data-updated={point.reading.lastUpdated ?? "never"}
                    title={
                      point.reading.lastUpdated
                        ? t("popover.updatedAt", {
                            time: new Date(
                              point.reading.lastUpdated,
                            ).toLocaleString(i18n.language),
                          })
                        : t("popover.neverUpdated")
                    }
                  >
                    {point.reading.lastUpdated
                      ? vocabulary.readingTime(point.reading.lastUpdated)
                      : SILENT_TEXT}
                  </span>
                )}
                {writable && editing !== point.slot && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={t("popover.edit")}
                    onClick={() => setEditing(point.slot)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </dd>
            </div>
            {writable && editing === point.slot && attribute && (
              <PointEditor
                device={device}
                attribute={attribute}
                onDone={() => setEditing(null)}
              />
            )}
          </div>
        );
      })}
    </dl>
  );
};

const isNumeric = (attribute: AttributeFields) =>
  attribute.data_type === "int" || attribute.data_type === "float";

/** What a value is read back as from the editor's text: null for a draft
 *  that is no value at all (an emptied field, a number that is not one),
 *  which is never written. */
const parse = (
  attribute: AttributeFields,
  text: string,
): AttributeValue | null => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!isNumeric(attribute)) return trimmed;
  const number = Number(trimmed);
  return Number.isNaN(number) ? null : number;
};

/**
 * The inline editor of one writable point: a switch for a boolean, worded
 * as the driver words its two states; a choice for an attribute with
 * options; a number or text field otherwise. A write goes through
 * `useAttributeWriter`, so the device's preflight, warnings and consent
 * apply as on its page.
 */
const PointEditor: FC<{
  device: Device;
  attribute: AttributeFields;
  onDone: () => void;
}> = ({ device, attribute, onDone }) => {
  const { t, i18n } = useTranslation("synoptics");
  const { t: tCommon } = useTranslation();
  const write = useAttributeWriter(device.id);
  const [draft, setDraft] = useState(String(attribute.current_value ?? ""));
  const [busy, setBusy] = useState(false);

  const apply = async (value: AttributeValue) => {
    setBusy(true);
    const outcome: WriteOutcome = await write(attribute.name, value);
    setBusy(false);
    if (outcome.kind === "ok") onDone();
    else if (outcome.kind === "unconfirmed")
      toast.warning(t("popover.unconfirmed"));
    else if (outcome.kind === "error")
      toast.error(outcome.message || t("popover.writeFailed"));
  };

  // Value labels are the wording of a boolean's two states (the backend
  // allows nothing else); options belong to the other types.
  const options = attribute.value_options?.map((value) => ({
    value: String(value),
    label: String(value),
  }));

  if (attribute.data_type === "bool") {
    const on = attribute.current_value === true;
    return (
      <div className="flex items-center justify-end gap-2" data-point-editor>
        <span className="text-xs text-muted-foreground" data-state-label>
          {valueLabelText(on, tCommon, attribute.value_labels, i18n.language)}
        </span>
        <Switch
          checked={on}
          disabled={busy}
          onCheckedChange={(checked) => void apply(checked)}
          aria-label={t("popover.edit")}
        />
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t("popover.cancel")}
        </Button>
      </div>
    );
  }

  const value = parse(attribute, draft);
  return (
    <form
      data-point-editor
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value !== null) void apply(value);
      }}
    >
      {options?.length ? (
        <Select value={draft} onValueChange={setDraft} disabled={busy}>
          <SelectTrigger className="h-8 flex-1" aria-label={t("popover.edit")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={isNumeric(attribute) ? "number" : "text"}
          step={attribute.data_type === "float" ? "any" : undefined}
          value={draft}
          disabled={busy}
          required
          onChange={(e) => setDraft(e.target.value)}
          aria-label={t("popover.edit")}
          className="h-8 flex-1"
        />
      )}
      <Button type="submit" size="sm" disabled={busy || value === null}>
        {t("popover.apply")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        {t("popover.cancel")}
      </Button>
    </form>
  );
};
