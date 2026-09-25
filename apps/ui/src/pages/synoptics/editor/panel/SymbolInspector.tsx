import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import {
  symbolSchemas,
  type Device,
  type Fluid,
  type SlotValue,
  type SymbolElement,
  type SynopticSummary,
} from "@gridone/sdk";
import { ConnectionStatusValue } from "@/components/ConnectionStatusBadge";
import { humanize } from "@/components/synoptic/text";
import type { CollectorProps } from "@/components/synoptic/symbols/ports";
import { SymbolThumb } from "@/components/synoptic/symbols/SymbolThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCanSeeConnectionStatus } from "@/hooks/useCanSeeConnectionStatus";
import { useDeviceById } from "@/hooks/useDeviceById";
import { getConnectionStatus } from "@/lib/devices";
import { usePlateVocabulary } from "../../usePlateVocabulary";
import { attachedPorts, canRotate } from "../document";
import { capitalize, pipeName, symbolName } from "../names";
import { describeError } from "../saveErrors";
import type { SynopticEditorState } from "../useSynopticEditor";
import { CollectorEditor } from "./CollectorEditor";
import { DeviceCombobox } from "./DeviceCombobox";
import { FluidSwatch } from "./FluidPicker";
import { InspectorHeader, Section } from "./InspectorHeader";
import { LinkTargetList } from "./LinkTargetList";
import { SegmentedControl } from "./SegmentedControl";
import { SlotRow } from "./SlotRow";

/** The props a type declares that a text field can hold: its plain
 *  strings. The collector's shape and the link's target have editors of
 *  their own. */
function textProps(type: string): string[] {
  const schema = symbolSchemas[type];
  if (!schema || schema["x-ports-authored"]) return [];
  return Object.entries(schema.properties ?? {}).flatMap(([key, raw]) => {
    if (key === "synoptic_id") return [];
    const prop = raw as { type?: string; anyOf?: { type?: string }[] };
    const type =
      prop.type ??
      prop.anyOf?.map((a) => a.type).find((t) => t && t !== "null");
    return type === "string" ? [key] : [];
  });
}

const ROTATIONS = [0, 1, 2, 3] as const;

type SymbolInspectorProps = {
  editor: SynopticEditorState;
  symbol: SymbolElement;
  devices: Device[];
  synoptics: SynopticSummary[];
};

/**
 * A selected symbol: its name, the device it stands for and the readings
 * it shows first, since binding is most of the work on a plate; then where
 * it stands, its own settings, and a collector's ports. The errors the
 * last save left on it read at the top, or under the reading they name.
 */
export function SymbolInspector({
  editor,
  symbol,
  devices,
  synoptics,
}: SymbolInspectorProps) {
  const { t } = useTranslation("synoptics");
  const vocabulary = usePlateVocabulary();
  const canSeeStatus = useCanSeeConnectionStatus();
  const { data: device } = useDeviceById(symbol.device_id ?? undefined);
  const schema = symbolSchemas[symbol.type];
  const slots = schema?.["x-slots"] ?? [];
  const { doc } = editor;
  const inline = symbol.placement.kind === "pipe";
  const typeLabel = capitalize(vocabulary.typeLabel(symbol.type));
  const name = symbolName(symbol, vocabulary.typeLabel);

  // A violation under `bindings.<slot>` reads under that slot; the rest,
  // one on `bindings` itself included, read at the top.
  const errors = useMemo(() => {
    const list = editor.errors.byElement.get(symbol.id) ?? [];
    const bySlot = new Map<string, string[]>();
    const top: string[] = [];
    for (const error of list) {
      const [head, slot] = error.path;
      if (head === "bindings" && typeof slot === "string") {
        bySlot.set(slot, [
          ...(bySlot.get(slot) ?? []),
          describeError(error, 2),
        ]);
      } else {
        top.push(describeError(error));
      }
    }
    return { bySlot, top };
  }, [editor.errors, symbol.id]);

  const collector =
    schema?.["x-ports-authored"] && symbol.props
      ? (symbol.props as CollectorProps)
      : null;
  const attached = useMemo(
    () => attachedPorts(doc, symbol.id),
    [doc, symbol.id],
  );
  const portFluids = useMemo(
    () =>
      new Map<string, Fluid>(
        (doc.pipes ?? []).flatMap((p) =>
          [p.from, p.to].flatMap((e) =>
            e.kind === "port" && e.symbol === symbol.id
              ? [[e.port, p.fluid] as [string, Fluid]]
              : [],
          ),
        ),
      ),
    [doc.pipes, symbol.id],
  );
  const { placement } = symbol;
  const ride =
    placement.kind === "pipe"
      ? doc.pipes?.find((p) => p.id === placement.pipe)
      : undefined;
  const setSlot = (slot: string, value: SlotValue | undefined) =>
    editor.changeSymbol(symbol.id, (s) => {
      const bindings = { ...s.bindings };
      if (value) bindings[slot] = value;
      else delete bindings[slot];
      return { ...s, bindings };
    });

  return (
    <div className="space-y-6">
      <InspectorHeader
        icon={
          <SymbolThumb
            type={symbol.type}
            height={26}
            className="bg-transparent"
          />
        }
        name={name}
        label={symbol.label ?? ""}
        onLabel={(text) => editor.typeLabel(symbol.id, text)}
        onLabelDone={editor.history.settle}
        subtitle={t(
          inline ? "editor.inspector.onPipe" : "editor.inspector.onFloor",
          {
            type: typeLabel,
          },
        )}
        actions={
          <>
            {!inline && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={t("editor.inspector.duplicate")}
                title={t("editor.inspector.duplicate")}
                onClick={() => editor.duplicate(symbol.id)}
              >
                <Copy aria-hidden className="size-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 text-destructive hover:text-destructive"
              aria-label={t("editor.inspector.delete")}
              title={t("editor.inspector.delete")}
              onClick={() => editor.remove({ kind: "symbol", id: symbol.id })}
            >
              <Trash2 aria-hidden className="size-4" />
            </Button>
          </>
        }
      />
      {errors.top.map((error) => (
        <p key={error} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ))}
      {symbol.type !== "link" && (
        <Section title={t("editor.inspector.device")}>
          <DeviceCombobox
            id="symbol-device"
            value={symbol.device_id ?? null}
            devices={devices}
            onChange={(deviceId) => editor.setDevice(symbol.id, deviceId)}
          />
          {device && canSeeStatus && (
            <p className="text-xs text-muted-foreground">
              <ConnectionStatusValue status={getConnectionStatus(device)} />
            </p>
          )}
        </Section>
      )}
      {slots.length > 0 && (
        <Section title={t("editor.inspector.readings")}>
          {!symbol.device_id && (
            <p className="text-xs text-muted-foreground">
              {t("editor.inspector.readingsHint")}
            </p>
          )}
          <div className="space-y-3">
            {slots.map((slot) => (
              <SlotRow
                key={slot}
                label={vocabulary.slotLabel(slot)}
                value={symbol.bindings?.[slot]}
                device={device}
                devices={devices}
                errors={errors.bySlot.get(slot) ?? []}
                onChange={(value) => setSlot(slot, value)}
                onType={(value, field) =>
                  editor.typeSymbol(
                    `slot:${slot}:${field}`,
                    symbol.id,
                    (s) => ({
                      ...s,
                      bindings: { ...s.bindings, [slot]: value },
                    }),
                  )
                }
                onSettle={editor.history.settle}
              />
            ))}
          </div>
        </Section>
      )}
      <Section title={t("editor.inspector.placement")}>
        {ride ? (
          <>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <FluidSwatch fluid={ride.fluid} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {pipeName(ride, (f) => t(`fluids.${f}`))}
              </span>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => editor.select({ kind: "pipe", id: ride.id })}
              >
                {t("editor.inspector.show")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("editor.inspector.slideHint")}
            </p>
          </>
        ) : canRotate(symbol) && symbol.placement.kind === "cell" ? (
          <div className="space-y-1.5">
            <Label>{t("editor.rotation")}</Label>
            <SegmentedControl
              label={t("editor.rotation")}
              value={symbol.placement.rotation ?? 0}
              onChange={(rotation) =>
                editor.changeSymbol(symbol.id, (s) =>
                  s.placement.kind === "cell"
                    ? { ...s, placement: { ...s.placement, rotation } }
                    : s,
                )
              }
              options={ROTATIONS.map((r) => ({
                value: r,
                label: `${r * 90}°`,
              }))}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("editor.inspector.moveHint")}
          </p>
        )}
      </Section>
      {textProps(symbol.type).map((key) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`prop-${key}`}>
            {t(`editor.props.${key}`, {
              defaultValue: capitalize(humanize(key)),
            })}
          </Label>
          <Input
            id={`prop-${key}`}
            value={String(symbol.props?.[key] ?? "")}
            onChange={(e) =>
              // An emptied text stays a text: the type requires a string,
              // and "" is the one empty value it saves.
              editor.typeSymbol(`prop:${key}`, symbol.id, (s) => ({
                ...s,
                props: { ...s.props, [key]: e.target.value },
              }))
            }
            onBlur={editor.history.settle}
          />
        </div>
      ))}
      {symbol.type === "link" && (
        <Section
          title={t("editor.link.target")}
          aside={
            typeof symbol.props?.synoptic_id === "string" && (
              <a
                href={`/synoptics/${encodeURIComponent(symbol.props.synoptic_id)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {t("editor.link.open")}
                <ExternalLink aria-hidden className="size-3" />
              </a>
            )
          }
        >
          <LinkTargetList
            value={
              typeof symbol.props?.synoptic_id === "string"
                ? symbol.props.synoptic_id
                : null
            }
            synoptics={synoptics}
            onChange={(id) =>
              editor.changeSymbol(symbol.id, (s) => ({
                ...s,
                props: { ...s.props, synoptic_id: id },
              }))
            }
          />
        </Section>
      )}
      {collector && (
        <Section title={t("editor.inspector.shape")}>
          <CollectorEditor
            shape={collector}
            attached={attached}
            fluids={portFluids}
            flat={doc.projection === "flat"}
            onAxis={(axis) => editor.setAxis(symbol.id, axis)}
            onShape={(props) =>
              editor.changeSymbol(symbol.id, (s) => ({ ...s, props }))
            }
            onTaken={() => editor.refuse("portTaken")}
          />
        </Section>
      )}
    </div>
  );
}
