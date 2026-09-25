import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Spline, Trash2 } from "lucide-react";
import type {
  AttributeSlot,
  Device,
  Endpoint,
  PipeElement,
} from "@gridone/sdk";
import { runCells } from "@/components/synoptic/runs";
import { SymbolThumb } from "@/components/synoptic/symbols/SymbolThumb";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { useDeviceById } from "@/hooks/useDeviceById";
import { deviceAttributes } from "@/lib/devices";
import { usePlateVocabulary } from "../../usePlateVocabulary";
import { boundDevice, type Selection } from "../document";
import { pipeName, symbolName } from "../names";
import { cellKey, runCorners } from "../runRules";
import { describeError } from "../saveErrors";
import type { SynopticEditorState } from "../useSynopticEditor";
import { DeviceCombobox } from "./DeviceCombobox";
import { FluidPicker } from "./FluidPicker";
import { InspectorHeader, Section } from "./InspectorHeader";
import { SlotEditor } from "./SlotEditor";

/**
 * The reading that sets a run moving in the isometric view: a bool of one
 * device, picked device first. The run only ever holds a whole flow, since
 * the backend refuses one without its reading: a device picked on its own
 * waits here until its reading is, and picking another device moves the
 * flow to it when it has the same reading (as a symbol's own readings
 * follow its device), or takes the old one off. A flow read through a
 * device filter (a hand-written plate) keeps the full editor.
 */
function FlowField({
  value,
  devices,
  onChange,
}: {
  value: AttributeSlot | null | undefined;
  devices: Device[];
  onChange: (flow: AttributeSlot | null) => void;
}) {
  const { t } = useTranslation("synoptics");
  const attributeLabel = useAttributeLabel();
  const bound = boundDevice(value);
  /** A device picked, its reading not yet. */
  const [pending, setPending] = useState<string | null>(null);
  // Undo can restore a complete flow while a device choice is unfinished.
  // The restored binding wins, and redo must not revive the stale choice.
  useEffect(() => {
    if (value) setPending(null);
  }, [value]);
  const deviceId = value ? bound : pending;
  const { data: device } = useDeviceById(deviceId ?? undefined);
  if (value && !bound) {
    return (
      <SlotEditor
        id="pipe-flow"
        label={t("editor.flow")}
        value={value}
        attributeOnly
        devices={devices}
        onChange={(next) => onChange(next?.kind === "attribute" ? next : null)}
      />
    );
  }
  const attributes = device ? deviceAttributes(device) : {};
  // The backend refuses a flow that is not a bool.
  const isBool = (of: Device | undefined, name: string) =>
    !!of && deviceAttributes(of)[name]?.data_type === "bool";
  const bools = Object.keys(attributes).filter((name) => isBool(device, name));
  const attribute = value?.target.attribute ?? "";
  const flowOf = (id: string, name: string): AttributeSlot => ({
    kind: "attribute",
    target: { devices: { ids: [id] }, attribute: name },
  });
  const pick = (id: string | null) => {
    if (!id) {
      setPending(null);
      onChange(null);
      return;
    }
    if (id === bound) {
      setPending(null);
      return;
    }
    const next = devices.find((d) => d.id === id);
    const kept = value?.target.attribute;
    if (kept && isBool(next, kept)) {
      setPending(null);
      onChange(flowOf(id, kept));
      return;
    }
    setPending(id);
    if (value) onChange(null);
  };
  return (
    <div className="space-y-2">
      <DeviceCombobox value={deviceId} devices={devices} onChange={pick} />
      {deviceId && (
        <Select
          value={attribute}
          onValueChange={(name) => {
            setPending(null);
            onChange(flowOf(deviceId, name));
          }}
        >
          <SelectTrigger
            aria-label={t("editor.pipeInspector.flowAttribute")}
            className="h-9"
          >
            <SelectValue placeholder={t("editor.pipeInspector.flowPick")} />
          </SelectTrigger>
          <SelectContent>
            {bools.map((name) => (
              <SelectItem key={name} value={name}>
                {attributeLabel(name, attributes[name])}
              </SelectItem>
            ))}
            {attribute && !bools.includes(attribute) && (
              <SelectItem value={attribute}>{attribute}</SelectItem>
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/**
 * A selected run: its fluid by circuit, where it goes from and to (each end
 * a way to the symbol or trunk it names), what rides it in the order the
 * fluid meets them, and the reading that sets it moving.
 */
export function PipeInspector({
  editor,
  pipe,
  devices,
}: {
  editor: SynopticEditorState;
  pipe: PipeElement;
  devices: Device[];
}) {
  const { t } = useTranslation("synoptics");
  const vocabulary = usePlateVocabulary();
  const { doc } = editor;
  const symbols = useMemo(
    () => new Map((doc.symbols ?? []).map((s) => [s.id, s])),
    [doc.symbols],
  );
  // Riders in the order the run crosses them, from `from` to `to`.
  const riders = useMemo(() => {
    const corners = runCorners(pipe, symbols);
    const order = new Map(
      (corners ? runCells(corners) : []).map((c, i) => [cellKey(c), i]),
    );
    return (doc.symbols ?? [])
      .filter(
        (s) => s.placement.kind === "pipe" && s.placement.pipe === pipe.id,
      )
      .sort(
        (a, b) =>
          (order.get(cellKey(a.placement.cell)) ?? 0) -
          (order.get(cellKey(b.placement.cell)) ?? 0),
      );
  }, [doc.symbols, pipe, symbols]);
  const raised = (pipe.waypoints ?? []).some((c) => (c.z ?? 0) > 0);
  const errors = (editor.errors.byElement.get(pipe.id) ?? []).map((e) =>
    describeError(e),
  );

  /** What an end of the run is, and what selecting it shows. */
  const end = (e: Endpoint): { text: string; target: Selection } => {
    if (e.kind === "port") {
      const symbol = symbols.get(e.symbol);
      return {
        text: symbol ? symbolName(symbol, vocabulary.typeLabel) : e.symbol,
        target: symbol ? { kind: "symbol", id: symbol.id } : null,
      };
    }
    if (e.kind === "pipe") {
      const trunk = doc.pipes?.find((p) => p.id === e.pipe);
      return {
        text: t("editor.pipeInspector.teeOn", {
          run: trunk ? pipeName(trunk, vocabulary.fluidLabel) : e.pipe,
        }),
        target: trunk ? { kind: "pipe", id: trunk.id } : null,
      };
    }
    return { text: t("editor.pipeInspector.freeEnd"), target: null };
  };
  const chip = (e: Endpoint) => {
    const { text, target } = end(e);
    return target ? (
      <button
        type="button"
        onClick={() => editor.select(target)}
        className="min-w-0 truncate rounded-md border bg-background px-2 py-1 text-sm font-medium hover:bg-muted"
      >
        {text}
      </button>
    ) : (
      <span className="min-w-0 truncate rounded-md border border-dashed px-2 py-1 text-sm text-muted-foreground">
        {text}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <InspectorHeader
        icon={<Spline aria-hidden className="size-5" />}
        name={pipeName(pipe, vocabulary.fluidLabel)}
        subtitle={t("editor.pipeInspector.subtitle", {
          count: pipe.waypoints?.length ?? 0,
        })}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 text-destructive hover:text-destructive"
            aria-label={t("editor.inspector.delete")}
            title={t("editor.inspector.delete")}
            onClick={() => editor.remove({ kind: "pipe", id: pipe.id })}
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        }
      />
      {errors.map((error) => (
        <p key={error} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ))}
      <Section title={t("editor.fluid")}>
        <FluidPicker
          value={pipe.fluid}
          onChange={(fluid) =>
            editor.changePipe(pipe.id, (p) => ({ ...p, fluid }))
          }
        />
      </Section>
      <Section title={t("editor.pipeInspector.route")}>
        <div className="flex items-center gap-2">
          {chip(pipe.from)}
          <ArrowRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          {chip(pipe.to)}
        </div>
        {raised && (
          <p className="text-xs text-muted-foreground">
            {t("editor.pipeInspector.raised")}
          </p>
        )}
        {riders.length > 0 && (
          <ul
            className="space-y-1"
            aria-label={t("editor.pipeInspector.riders")}
          >
            {riders.map((rider) => (
              <li key={rider.id}>
                <button
                  type="button"
                  onClick={() =>
                    editor.select({ kind: "symbol", id: rider.id })
                  }
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted"
                >
                  <SymbolThumb type={rider.type} height={20} />
                  <span className="truncate">
                    {symbolName(rider, vocabulary.typeLabel)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={t("editor.flow")}>
        <p className="text-xs text-muted-foreground">
          {t("editor.pipeInspector.flowHint")}
        </p>
        <FlowField
          key={pipe.id}
          value={pipe.flow}
          devices={devices}
          onChange={(flow) =>
            editor.changePipe(pipe.id, (p) => ({ ...p, flow }))
          }
        />
      </Section>
    </div>
  );
}
