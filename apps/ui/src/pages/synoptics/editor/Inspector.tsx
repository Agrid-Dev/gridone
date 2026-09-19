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
import { humanize, type CollectorProps } from "@/components/synoptic";
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
import { canRotate, nextFree, type Selection } from "./document";
import { describeError, type ElementError } from "./saveErrors";
import { readNumber, SlotEditor } from "./SlotEditor";

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
  /** The selected symbol's ports a run is attached to. */
  attached: ReadonlySet<string>;
  errors: ElementError[];
  onSymbolChange: (patch: (symbol: SymbolElement) => SymbolElement) => void;
  onPipeChange: (patch: (pipe: PipeElement) => PipeElement) => void;
  onDelete: () => void;
};

type ScalarProp = {
  type: "string" | "integer" | "number";
  enum?: string[];
  minimum?: number;
};

/** The floor a number field shows, read off its schema. */
const minimumOf = (raw: unknown): number | undefined =>
  (raw as { minimum?: number } | undefined)?.minimum;

/** The collector's length floor, the same value its placement seeds. */
const COLLECTOR_LENGTH_MIN = minimumOf(
  symbolSchemas.collector?.properties.length,
);

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
    return [
      [key, { type, enum: schema.enum, minimum: minimumOf(schema) }] as [
        string,
        ScalarProp,
      ],
    ];
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
  attached,
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
  // with whatever path is left below it; the rest read at the top, which
  // includes one on `bindings` itself (a required slot left unbound).
  const sorted = errors.map((e) => {
    const [head, name] = e.path;
    const slot =
      head === "flow"
        ? "flow"
        : head === "bindings" && typeof name === "string"
          ? name
          : null;
    const depth = slot === "flow" ? 1 : slot ? 2 : 0;
    return { slot, text: describeError(e, depth) };
  });
  const slotErrors = (slot: string) =>
    sorted.filter((e) => e.slot === slot).map((e) => e.text);
  const otherErrors = sorted.filter((e) => e.slot === null).map((e) => e.text);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {selection.id}
          <span className="ml-2 font-normal text-muted-foreground">
            {symbol ? humanize(symbol.type) : t("editor.pipe")}
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
          attached={attached}
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
                    {humanize(fluid)}
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
  attached: ReadonlySet<string>;
  slotErrors: (slot: string) => string[];
  onChange: InspectorProps["onSymbolChange"];
};

const SymbolFields: FC<SymbolFieldsProps> = ({
  symbol,
  devices,
  synoptics,
  attached,
  slotErrors,
  onChange,
}) => {
  const { t } = useTranslation("synoptics");
  const schema = symbolSchemas[symbol.type];
  const rotation =
    canRotate(symbol) && symbol.placement.kind === "cell"
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
            humanize(key),
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
                min={prop.minimum}
                value={String(symbol.props?.[key] ?? "")}
                onChange={(e) =>
                  // An emptied text stays a text: the type requires a
                  // string, and "" is the one empty value it saves.
                  setProp(
                    key,
                    prop.type === "string"
                      ? e.target.value
                      : readNumber(prop.type, e.target.value),
                  )
                }
              />
            ),
          ),
        )}
      {schema?.["x-ports-authored"] && (
        <CollectorFields
          value={symbol.props as CollectorShape}
          attached={attached}
          onChange={(props) => onChange((s) => ({ ...s, props }))}
        />
      )}
      {(schema?.["x-slots"] ?? []).map((slot) => (
        <SlotEditor
          key={slot}
          id={`slot-${slot}`}
          label={humanize(slot)}
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

/** The collector's authored shape: which way the bar runs, how long it
 *  is, and each port's offset along it and the face it takes. The shared
 *  form builder cannot render a map of ports, so this is by hand. The
 *  shape arrives complete: placement seeds it, and a stored plate holds
 *  what the backend validated. A port a run is attached to cannot be
 *  removed: the run would be left naming it, so the author deletes the
 *  run first and sees what they are breaking. */
const CollectorFields: FC<{
  value: CollectorShape;
  attached: ReadonlySet<string>;
  onChange: (props: CollectorShape) => void;
}> = ({ value: shape, attached, onChange }) => {
  const { t } = useTranslation("synoptics");
  const setPort = (
    name: string,
    port: CollectorShape["ports"][string] | null,
  ) => {
    const ports = { ...shape.ports };
    if (port) ports[name] = port;
    else delete ports[name];
    onChange({ ...shape, ports });
  };
  const nextName = (kind: "in" | "out") =>
    nextFree(
      (n) => `${kind}_${n}`,
      (name) => name in shape.ports,
    );
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
            min={COLLECTOR_LENGTH_MIN}
            value={shape.length ?? ""}
            onChange={(e) =>
              onChange({
                ...shape,
                length: readNumber("integer", e.target.value),
              })
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
              setPort(name, {
                ...port,
                offset: readNumber("integer", e.target.value),
              })
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
            title={
              attached.has(name)
                ? t("editor.collector.portAttached")
                : undefined
            }
            disabled={attached.has(name)}
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
