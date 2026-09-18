import type { FC, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  symbolSchemas,
  type Device,
  type Fluid,
  type PipeElement,
  type Side,
  type SymbolElement,
  type SynopticSummary,
} from "@gridone/sdk";
import type { CollectorProps } from "@/components/synoptic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FLUIDS } from "@/lib/fluidColors";
import type { Selection } from "./document";
import { describeError, type ElementError } from "./saveErrors";
import { SlotEditor } from "./SlotEditor";

const SIDES: Side[] = ["+x", "-x", "+y", "-y", "+z", "-z"];
const ROTATIONS = [0, 1, 2, 3];
/** The value a select stores for "none", since a select item cannot be
 *  empty. */
const NONE = "__none__";

type InspectorProps = {
  selection: Selection;
  symbol: SymbolElement | undefined;
  pipe: PipeElement | undefined;
  devices: Device[];
  synoptics: SynopticSummary[];
  errors: ElementError[];
  onSymbolChange: (patch: (symbol: SymbolElement) => SymbolElement) => void;
  onPipeChange: (patch: (pipe: PipeElement) => PipeElement) => void;
  onDelete: () => void;
};

type ScalarProp = { type: "string" | "integer" | "number"; enum?: string[] };

/** The props a type declares that a text or number field can hold: a
 *  plain scalar, or one that may also be null. The collector's port map
 *  and the link's target have fields of their own. */
function scalarProps(
  properties: Record<string, unknown> | undefined,
): [string, ScalarProp][] {
  return Object.entries(properties ?? {}).flatMap(([key, raw]) => {
    if (key === "synoptic_id") return [];
    const schema = raw as {
      type?: string;
      enum?: string[];
      anyOf?: { type?: string }[];
    };
    const type =
      schema.type ??
      schema.anyOf?.map((a) => a.type).find((t) => t && t !== "null");
    if (type !== "string" && type !== "integer" && type !== "number") return [];
    return [[key, { type, enum: schema.enum }] as [string, ScalarProp]];
  });
}

const field = (id: string, label: string, control: ReactNode) => (
  <div key={id} className="space-y-1">
    <Label htmlFor={id}>{label}</Label>
    {control}
  </div>
);

/** What the selection reads and can change: a symbol's label, rotation,
 *  device, props and slots, or a pipe's fluid and flow. The errors the
 *  last save left on it are listed under the fields they name. */
export const Inspector: FC<InspectorProps> = ({
  selection,
  symbol,
  pipe,
  devices,
  synoptics,
  errors,
  onSymbolChange,
  onPipeChange,
  onDelete,
}) => {
  const { t } = useTranslation(["synoptics", "common"]);
  if (!selection || (!symbol && !pipe)) {
    return (
      <p className="text-sm text-muted-foreground">{t("editor.noSelection")}</p>
    );
  }
  // A violation under `bindings.<slot>` or `flow` reads under that slot,
  // with whatever path is left below it; the rest read at the top.
  const onSlot = (e: ElementError) =>
    e.path[0] === "flow" ? 1 : e.path[0] === "bindings" ? 2 : 0;
  const slotErrors = (slot: string) =>
    errors
      .filter(
        (e) =>
          (onSlot(e) === 1 && slot === "flow") ||
          (onSlot(e) === 2 && e.path[1] === slot),
      )
      .map((e) => describeError(e, onSlot(e)));
  const otherErrors = errors
    .filter((e) => onSlot(e) === 0)
    .map((e) => describeError(e));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {selection.id}
          <span className="ml-2 font-normal text-muted-foreground">
            {symbol ? symbol.type.replace(/_/g, " ") : t("editor.pipe")}
          </span>
        </h3>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={onDelete}
        >
          {t("common:common.delete")}
        </Button>
      </div>
      {otherErrors.map((error) => (
        <p key={error} className="text-sm text-destructive">
          {error}
        </p>
      ))}
      {symbol && (
        <SymbolFields
          symbol={symbol}
          devices={devices}
          synoptics={synoptics}
          slotErrors={slotErrors}
          onChange={onSymbolChange}
        />
      )}
      {pipe && (
        <>
          {field(
            "pipe-fluid",
            t("editor.fluid"),
            <Select
              value={pipe.fluid}
              onValueChange={(fluid) =>
                onPipeChange((p) => ({ ...p, fluid: fluid as Fluid }))
              }
            >
              <SelectTrigger id="pipe-fluid">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLUIDS.map((fluid) => (
                  <SelectItem key={fluid} value={fluid}>
                    {fluid.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}
          <SlotEditor
            id="pipe-flow"
            label={t("editor.flow")}
            value={pipe.flow ?? undefined}
            attributeOnly
            devices={devices}
            errors={slotErrors("flow")}
            onChange={(flow) =>
              onPipeChange((p) => ({
                ...p,
                flow: flow?.kind === "attribute" ? flow : null,
              }))
            }
          />
        </>
      )}
    </div>
  );
};

type SymbolFieldsProps = {
  symbol: SymbolElement;
  devices: Device[];
  synoptics: SynopticSummary[];
  slotErrors: (slot: string) => string[];
  onChange: InspectorProps["onSymbolChange"];
};

const SymbolFields: FC<SymbolFieldsProps> = ({
  symbol,
  devices,
  synoptics,
  slotErrors,
  onChange,
}) => {
  const { t } = useTranslation("synoptics");
  const schema = symbolSchemas[symbol.type];
  const rotation =
    symbol.placement.kind === "cell" && !schema?.["x-rotation-locked"]
      ? (symbol.placement.rotation ?? 0)
      : null;
  const setProp = (key: string, value: unknown) =>
    onChange((s) => ({ ...s, props: { ...s.props, [key]: value } }));

  return (
    <>
      {field(
        "symbol-label",
        t("editor.label"),
        <Input
          id="symbol-label"
          value={symbol.label ?? ""}
          onChange={(e) =>
            onChange((s) => ({ ...s, label: e.target.value || null }))
          }
        />,
      )}
      {rotation !== null &&
        field(
          "symbol-rotation",
          t("editor.rotation"),
          <Select
            value={String(rotation)}
            onValueChange={(v) =>
              onChange((s) =>
                s.placement.kind === "cell"
                  ? { ...s, placement: { ...s.placement, rotation: Number(v) } }
                  : s,
              )
            }
          >
            <SelectTrigger id="symbol-rotation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROTATIONS.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {r * 90}°
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
        )}
      {field(
        "symbol-device",
        t("editor.device"),
        <Select
          value={symbol.device_id ?? NONE}
          onValueChange={(v) =>
            onChange((s) => ({ ...s, device_id: v === NONE ? null : v }))
          }
        >
          <SelectTrigger id="symbol-device">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("editor.slot.none")}</SelectItem>
            {devices.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      )}
      {symbol.type === "link" &&
        field(
          "link-target",
          t("editor.linkTarget"),
          <Select
            value={String(symbol.props?.synoptic_id ?? NONE)}
            onValueChange={(v) => setProp("synoptic_id", v === NONE ? null : v)}
          >
            <SelectTrigger id="link-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("editor.slot.none")}</SelectItem>
              {synoptics.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
        )}
      {/* A collector's shape has a form of its own below. */}
      {!schema?.["x-ports-authored"] &&
        scalarProps(schema?.properties).map(([key, prop]) =>
          field(
            `prop-${key}`,
            key.replace(/_/g, " "),
            prop.enum ? (
              <Select
                value={String(symbol.props?.[key] ?? "")}
                onValueChange={(v) => setProp(key, v)}
              >
                <SelectTrigger id={`prop-${key}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {prop.enum.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={`prop-${key}`}
                type={prop.type === "string" ? "text" : "number"}
                value={String(symbol.props?.[key] ?? "")}
                onChange={(e) =>
                  setProp(
                    key,
                    e.target.value === ""
                      ? null
                      : prop.type === "string"
                        ? e.target.value
                        : Number(e.target.value),
                  )
                }
              />
            ),
          ),
        )}
      {schema?.["x-ports-authored"] && (
        <CollectorFields
          value={symbol.props as Partial<CollectorShape>}
          onChange={(props) => onChange((s) => ({ ...s, props }))}
        />
      )}
      {(schema?.["x-slots"] ?? []).map((slot) => (
        <SlotEditor
          key={slot}
          id={`slot-${slot}`}
          label={slot.replace(/_/g, " ")}
          value={symbol.bindings?.[slot]}
          devices={devices}
          errors={slotErrors(slot)}
          onChange={(value) =>
            onChange((s) => {
              const bindings = { ...s.bindings };
              if (value) bindings[slot] = value;
              else delete bindings[slot];
              return { ...s, bindings };
            })
          }
        />
      ))}
    </>
  );
};

/** The collector's shape while it is authored: a field the author has
 *  emptied holds null until they type again, and the save says so. */
type CollectorShape = {
  axis: CollectorProps["axis"];
  length: number | null;
  ports: Record<string, { offset: number | null; side: Side }>;
};

const blankToNull = (value: string) => (value === "" ? null : Number(value));

/** The collector's authored shape: which way the bar runs, how long it
 *  is, and each port's offset along it and the face it takes. The shared
 *  form builder cannot render a map of ports, so this is by hand. */
const CollectorFields: FC<{
  value: Partial<CollectorShape>;
  onChange: (props: CollectorShape) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation("synoptics");
  const shape: CollectorShape = {
    axis: value.axis ?? "x",
    length: value.length === undefined ? 2 : value.length,
    ports: value.ports ?? {},
  };
  const setPort = (
    name: string,
    port: CollectorShape["ports"][string] | null,
  ) => {
    const ports = { ...shape.ports };
    if (port) ports[name] = port;
    else delete ports[name];
    onChange({ ...shape, ports });
  };
  const nextName = (kind: "in" | "out") => {
    for (let n = 1; ; n++) {
      if (!(`${kind}_${n}` in shape.ports)) return `${kind}_${n}`;
    }
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {field(
          "collector-axis",
          t("editor.collector.axis"),
          <Select
            value={shape.axis}
            onValueChange={(axis) =>
              onChange({ ...shape, axis: axis as CollectorProps["axis"] })
            }
          >
            <SelectTrigger id="collector-axis">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="x">x</SelectItem>
              <SelectItem value="y">y</SelectItem>
            </SelectContent>
          </Select>,
        )}
        {field(
          "collector-length",
          t("editor.collector.length"),
          <Input
            id="collector-length"
            type="number"
            min={2}
            value={shape.length ?? ""}
            onChange={(e) =>
              onChange({ ...shape, length: blankToNull(e.target.value) })
            }
          />,
        )}
      </div>
      <Label>{t("editor.collector.ports")}</Label>
      {Object.entries(shape.ports).map(([name, port]) => (
        <div key={name} className="flex items-center gap-2">
          <span className="w-16 text-sm">{name}</span>
          <Input
            aria-label={`${name} offset`}
            type="number"
            min={0}
            className="w-20"
            value={port.offset ?? ""}
            onChange={(e) =>
              setPort(name, { ...port, offset: blankToNull(e.target.value) })
            }
          />
          <Select
            value={port.side}
            onValueChange={(side) =>
              setPort(name, { ...port, side: side as Side })
            }
          >
            <SelectTrigger aria-label={`${name} side`} className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIDES.map((side) => (
                <SelectItem key={side} value={side}>
                  {side}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`${t("editor.collector.removePort")} ${name}`}
            onClick={() => setPort(name, null)}
          >
            ×
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        {(["in", "out"] as const).map((kind) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPort(nextName(kind), { offset: 0, side: "-y" })}
          >
            {t(`editor.collector.add.${kind}`)}
          </Button>
        ))}
      </div>
    </div>
  );
};
