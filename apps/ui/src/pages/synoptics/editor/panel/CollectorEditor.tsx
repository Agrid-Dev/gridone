import { useTranslation } from "react-i18next";
import { Lock, Minus, Plus, X } from "lucide-react";
import type { Fluid, Side } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sideVector } from "@/components/synoptic/projection";
import type { CollectorProps } from "@/components/synoptic/symbols/ports";
import { fluidStrokeClass } from "@/lib/fluidColors";
import { nextFree } from "../document";
import { NumberField } from "./NumberField";
import { SegmentedControl } from "./SegmentedControl";

type PortKind = "in" | "out";
type Port = CollectorProps["ports"][string];

/** The longest bar the editor offers, and the shortest the registry
 *  takes. The registry takes bars up to 10 000 cells, but the longest on
 *  the site's plates is 41 and the diagram draws every cell with a menu on
 *  each free face: past a hundred, it would only slow the page down. */
const LENGTH_MAX = 100;
const LENGTH_MIN = 2;

/** Every face a port can take, the vertical ones (the isometric view's
 *  risers) last. */
const SIDES: Side[] = ["-y", "+y", "-x", "+x", "+z", "-z"];
/** How the plan reads a face: up the sheet, down, left, right, and the two
 *  vertical faces only the isometric view draws. */
const SIDE_WORD = {
  "-y": "up",
  "+y": "down",
  "-x": "left",
  "+x": "right",
  "+z": "above",
  "-z": "below",
} as const satisfies Record<Side, string>;

const kindOf = (name: string): PortKind =>
  name.startsWith("in_") ? "in" : "out";

/** The faces a bar offers in the diagram: across it on either side at
 *  every cell, and one out of each end. */
function faces(axis: CollectorProps["axis"]) {
  return axis === "x"
    ? { across: ["-y", "+y"] as Side[], start: "-x" as Side, end: "+x" as Side }
    : {
        across: ["-x", "+x"] as Side[],
        start: "-y" as Side,
        end: "+y" as Side,
      };
}

/** The diagram's cell, in px: a short bar fills the panel, a long one
 *  keeps cells a "+" fits in and scrolls. */
const cellPx = (length: number) => Math.max(30, Math.min(40, 232 / length));

type Slot = { offset: number; side: Side };

/**
 * The bar and its ports as the plan draws them, with a "+" on each face a
 * port could take: across the bar at every cell and out of each end. A
 * port on another face (an end face mid-bar, a vertical one) is listed
 * below, not drawn here.
 */
function PortsDiagram({
  shape,
  fluids,
  onAdd,
}: {
  shape: CollectorProps;
  fluids: ReadonlyMap<string, Fluid>;
  onAdd: (slot: Slot, kind: PortKind) => void;
}) {
  const { t } = useTranslation("synoptics");
  const { axis, length, ports } = shape;
  const c = cellPx(length);
  const along = axis === "x" ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const f = faces(axis);
  const barLong = c * length;
  // Room for a port and its name on every side of the bar.
  const pad = c + 24;
  const width = axis === "x" ? barLong + 2 * pad : 2 * pad + c;
  const height = axis === "x" ? 2 * pad + c : barLong + 2 * pad;
  const cellCentre = (offset: number) => ({
    x: pad + (along.x * offset + 0.5) * c,
    y: pad + (along.y * offset + 0.5) * c,
  });
  const slotAt = ({ offset, side }: Slot) => {
    const from = cellCentre(offset);
    const v = sideVector(side);
    return {
      edge: { x: from.x + (v.x * c) / 2, y: from.y + (v.y * c) / 2 },
      tip: { x: from.x + v.x * c, y: from.y + v.y * c },
    };
  };
  const slots: Slot[] = [
    ...Array.from({ length }, (_, offset) =>
      f.across.map((side) => ({ offset, side })),
    ).flat(),
    { offset: 0, side: f.start },
    { offset: length - 1, side: f.end },
  ];
  const portAt = new Map(
    Object.entries(ports).map(([name, port]) => [
      `${port.offset}|${port.side}`,
      name,
    ]),
  );
  return (
    <div className="max-h-96 overflow-auto rounded-md border bg-synoptic-plate">
      <div
        className="relative mx-auto"
        style={{ width, height }}
        data-collector-diagram
      >
        <svg
          aria-hidden
          width={width}
          height={height}
          className="absolute inset-0"
        >
          <rect
            x={axis === "x" ? pad : pad + c * 0.3}
            y={axis === "x" ? pad + c * 0.3 : pad}
            width={axis === "x" ? barLong : c * 0.4}
            height={axis === "x" ? c * 0.4 : barLong}
            rx={3}
            strokeWidth={1.5}
            className="fill-muted stroke-synoptic-stroke"
          />
          {slots.map((slot) => {
            const name = portAt.get(`${slot.offset}|${slot.side}`);
            if (!name) return null;
            const { edge, tip } = slotAt(slot);
            const fluid = fluids.get(name);
            return (
              <g key={name}>
                <line
                  x1={edge.x}
                  y1={edge.y}
                  x2={tip.x}
                  y2={tip.y}
                  strokeWidth={4}
                  strokeLinecap="round"
                  className={
                    fluid ? fluidStrokeClass(fluid) : "stroke-muted-foreground"
                  }
                />
                <text
                  x={tip.x + (sideVector(slot.side).x >= 0 ? 6 : -6)}
                  y={tip.y + (sideVector(slot.side).y > 0 ? 14 : -6)}
                  textAnchor={sideVector(slot.side).x < 0 ? "end" : "start"}
                  fontSize={12}
                  className="fill-foreground"
                >
                  {name}
                </text>
              </g>
            );
          })}
        </svg>
        {slots
          .filter((slot) => !portAt.has(`${slot.offset}|${slot.side}`))
          .map((slot) => {
            const { tip } = slotAt(slot);
            const where = t(`editor.sides.${SIDE_WORD[slot.side]}`);
            return (
              <DropdownMenu key={`${slot.offset}|${slot.side}`}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("editor.collector.addAt", {
                      side: where,
                      position: slot.offset + 1,
                    })}
                    data-collector-slot={`${slot.offset}|${slot.side}`}
                    className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-muted-foreground/60 bg-background text-muted-foreground outline-none hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ left: tip.x, top: tip.y }}
                  >
                    <Plus aria-hidden className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {(["in", "out"] as const).map((kind) => (
                    <DropdownMenuItem
                      key={kind}
                      onSelect={() => onAdd(slot, kind)}
                    >
                      {t(`editor.collector.kinds.${kind}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
      </div>
    </div>
  );
}

/**
 * The collector's authored shape: which way the bar runs, how long it is,
 * and each port's face and cell. A port a run is attached to cannot be
 * removed (the run would be left naming it); moving it moves the run with
 * it. The bar never shrinks past its last port: the backend refuses a
 * port beyond the bar's end.
 */
export function CollectorEditor({
  shape,
  attached,
  fluids,
  flat,
  onAxis,
  onShape,
  onTaken,
}: {
  shape: CollectorProps;
  /** The ports a run is attached to. */
  attached: ReadonlySet<string>;
  /** The fluid of the run on each attached port, for the diagram. */
  fluids: ReadonlyMap<string, Fluid>;
  /** The plate opens flat: no port may face up or down. */
  flat: boolean;
  onAxis: (axis: CollectorProps["axis"]) => void;
  onShape: (shape: CollectorProps) => void;
  /** A port was put where another already is: nothing changed. */
  onTaken: () => void;
}) {
  const { t } = useTranslation("synoptics");
  const ports = Object.entries(shape.ports ?? {}).sort(
    ([a, pa], [b, pb]) => pa.offset - pb.offset || a.localeCompare(b),
  );
  const floor = Math.max(
    LENGTH_MIN,
    ...ports.map(([, port]) => port.offset + 1),
  );
  const setLength = (length: number) =>
    onShape({
      ...shape,
      length: Math.min(LENGTH_MAX, Math.max(floor, length)),
    });
  /** Whether a port other than `name` stands at that cell, on that face:
   *  two would draw as one, and a run could reach only one of them. */
  const taken = (name: string, { offset, side }: Slot) =>
    Object.entries(shape.ports ?? {}).some(
      ([other, p]) => other !== name && p.offset === offset && p.side === side,
    );
  const setPort = (name: string, port: Port | null) => {
    if (port && taken(name, port)) {
      onTaken();
      return;
    }
    const next = { ...shape.ports };
    if (port) next[name] = port;
    else delete next[name];
    onShape({ ...shape, ports: next });
  };
  const add = ({ offset, side }: Slot, kind: PortKind) =>
    setPort(
      nextFree(
        (n) => `${kind}_${n}`,
        (name) => name in shape.ports,
      ),
      { offset, side },
    );
  const sides = flat ? SIDES.filter((s) => s !== "+z" && s !== "-z") : SIDES;

  return (
    <div className="space-y-4" data-collector-editor>
      <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-end gap-2">
        <div className="space-y-1.5">
          <Label>{t("editor.collector.axis")}</Label>
          <SegmentedControl
            label={t("editor.collector.axis")}
            value={shape.axis}
            onChange={onAxis}
            options={[
              { value: "x", label: t("editor.collector.horizontal") },
              { value: "y", label: t("editor.collector.vertical") },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collector-length">
            {t("editor.collector.length")}
          </Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              aria-label={t("editor.collector.shorter")}
              disabled={shape.length <= floor}
              onClick={() => setLength(shape.length - 1)}
            >
              <Minus aria-hidden className="size-4" />
            </Button>
            <NumberField
              id="collector-length"
              className="h-9 px-1 text-center"
              min={floor}
              max={LENGTH_MAX}
              value={shape.length}
              onCommit={setLength}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              aria-label={t("editor.collector.longer")}
              disabled={shape.length >= LENGTH_MAX}
              onClick={() => setLength(shape.length + 1)}
            >
              <Plus aria-hidden className="size-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label>{t("editor.collector.ports")}</Label>
          <span className="text-xs text-muted-foreground">
            {t("editor.collector.addHint")}
          </span>
        </div>
        <PortsDiagram shape={shape} fluids={fluids} onAdd={add} />
        <ul className="space-y-1.5">
          {ports.map(([name, port]) => {
            const locked = attached.has(name);
            return (
              <li
                key={name}
                data-collector-port={name}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)_4rem_2.25rem] items-center gap-1.5"
              >
                <span className="text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`editor.collector.kinds.${kindOf(name)}`)}
                  </span>
                </span>
                <Select
                  value={port.side}
                  onValueChange={(side) =>
                    setPort(name, { ...port, side: side as Side })
                  }
                >
                  <SelectTrigger
                    aria-label={t("editor.collector.side", { port: name })}
                    className="h-9"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(sides.includes(port.side)
                      ? sides
                      : [...sides, port.side]
                    ).map((side) => (
                      <SelectItem
                        key={side}
                        value={side}
                        disabled={taken(name, { offset: port.offset, side })}
                      >
                        {t(`editor.sides.${SIDE_WORD[side]}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Cells count from 1 on screen, as the diagram names them. */}
                <NumberField
                  aria-label={t("editor.collector.offset", { port: name })}
                  className="h-9 px-2"
                  min={1}
                  max={shape.length}
                  value={port.offset + 1}
                  onCommit={(cell) =>
                    setPort(name, { ...port, offset: cell - 1 })
                  }
                />
                {locked ? (
                  <span
                    title={t("editor.collector.portAttached")}
                    className="flex size-9 items-center justify-center text-muted-foreground"
                  >
                    <Lock aria-hidden className="size-4" />
                    <span className="sr-only">
                      {t("editor.collector.portAttached")}
                    </span>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={`${t("editor.collector.removePort")} ${name}`}
                    onClick={() => setPort(name, null)}
                  >
                    <X aria-hidden className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {ports.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("editor.collector.noPorts")}
          </p>
        )}
      </div>
    </div>
  );
}
