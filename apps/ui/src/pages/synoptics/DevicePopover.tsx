import { useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  isNotFound,
  symbolSchemas,
  type Device,
  type SymbolElement,
} from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { humanize } from "@/components/synoptic";
import {
  readingState,
  SILENT_READING,
  symbolSlotKey,
  type SlotReading,
  type SynopticValues,
} from "@/components/synoptic/values";
import type { WriteOutcome } from "@/components/device-ui/runtime/controlRuntime";
import { Badge } from "@/components/ui/badge";
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
import { useAttributeWriter } from "@/hooks/useAttributeCommandRuntime";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { useDeviceById } from "@/hooks/useDeviceById";
import {
  deviceAttributes,
  isAttributeWritable,
  type AttributeValue,
} from "@/lib/devices";
import { valueLabelText } from "@/lib/attributeValueLabel";
import type { AttributeFields } from "@/lib/faults";
import { cn } from "@/lib/utils";

/** One point of the symbol: a slot its type declares, bound in the
 *  document, and what it reads. `attribute` names the device attribute
 *  behind a live binding; a literal has none. */
type Point = {
  slot: string;
  attribute: string | null;
  reading: SlotReading;
};

/** The symbol's bound slots, in the order its type declares them. */
function pointsOf(symbol: SymbolElement, values: SynopticValues): Point[] {
  return (symbolSchemas[symbol.type]?.["x-slots"] ?? []).flatMap((slot) => {
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

type DevicePopoverProps = {
  symbol: SymbolElement;
  values: SynopticValues;
  onClose: () => void;
};

/**
 * What a click on a device symbol opens, on the plate: the device's name
 * and a link to its page, and the symbol's own points (the slots the
 * document binds) with their live readings. A point whose attribute the
 * device lets one write is edited here, through the same preflight and
 * consent as the device page. Nothing else of the device is shown: the
 * plate names what matters, the device page has the rest.
 */
export const DevicePopover: FC<DevicePopoverProps> = ({
  symbol,
  values,
  onClose,
}) => {
  const { t } = useTranslation("synoptics");
  const { t: tCommon } = useTranslation();
  const deviceId = symbol.device_id ?? undefined;
  const result = useDeviceById(deviceId);
  const device = result.data;
  const points = pointsOf(symbol, values);

  return (
    <div
      aria-label={t("popover.label")}
      className="flex w-72 flex-col gap-3 text-sm"
      data-device-popover={symbol.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">
            {symbol.label ?? device?.name ?? deviceId}
          </div>
          <div className="text-xs text-muted-foreground">
            {device?.name && device.name !== symbol.label
              ? device.name
              : humanize(symbol.type)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {device?.is_faulty && (
            <Badge variant="destructive">{t("legend.fault")}</Badge>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            aria-label={t("popover.close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {result.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : result.error || !device ? (
        <p className="text-muted-foreground">
          {isNotFound(result.error)
            ? tCommon("common.deviceNotFound")
            : tCommon("common.deviceLoadError")}
        </p>
      ) : (
        <PointList device={device} points={points} />
      )}
      {deviceId && (
        <Link
          to={`/devices/${deviceId}`}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:underline"
        >
          {t("popover.open")}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
};

const PointList: FC<{ device: Device; points: Point[] }> = ({
  device,
  points,
}) => {
  const { t } = useTranslation("synoptics");
  const labelFor = useAttributeLabel();
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
          !!point.attribute && isAttributeWritable(device, point.attribute);
        const state = readingState(point.reading);
        return (
          <div
            key={point.slot}
            data-point={point.slot}
            className="flex flex-col gap-1 py-1.5"
          >
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {point.attribute
                  ? labelFor(point.attribute, attribute)
                  : humanize(point.slot)}
              </dt>
              <dd className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    state === "live"
                      ? "text-synoptic-reading"
                      : "text-muted-foreground",
                    state === "note" && "font-normal italic",
                  )}
                  data-reading={state}
                >
                  {point.reading.text ?? "–"}
                  {point.reading.unit && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      {point.reading.unit}
                    </span>
                  )}
                </span>
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
