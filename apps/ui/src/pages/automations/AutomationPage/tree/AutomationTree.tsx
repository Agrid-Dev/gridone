import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { AutomationBranch } from "@gridone/sdk";
import { cn } from "@/lib/utils";
import {
  MAX_TREE_BRANCHES,
  caseResult,
  otherwiseTaken,
  viewOf,
  type CaseView,
  type DecisionView,
  type InsertTarget,
  type OutcomeView,
} from "./model";
import {
  ActionNode,
  CaseNode,
  DecisionNode,
  NothingNode,
  OtherwiseNode,
  PickNode,
  TriggerNode,
} from "./nodes";
import { useTree } from "./TreeContext";

type Tone = "edge" | "hl" | "dim";

const STROKE: Record<Tone, string> = {
  edge: "stroke-muted-foreground/45",
  hl: "stroke-primary",
  dim: "stroke-muted-foreground/20",
};
const FILL: Record<Tone, string> = {
  edge: "fill-muted-foreground/45",
  hl: "fill-primary",
  dim: "fill-muted-foreground/20",
};
const LINE: Record<Tone, string> = {
  edge: "w-[1.5px] bg-muted-foreground/45",
  hl: "w-[2.5px] bg-primary",
  dim: "w-[1.5px] bg-muted-foreground/20",
};

/**
 * The automation drawn top-down: the trigger, then either a single action or
 * a decision whose cases stand side by side, each above its own outcome.
 */
export function AutomationTree({ branches }: { branches: AutomationBranch[] }) {
  const view = useMemo(() => viewOf(branches), [branches]);
  const { replay } = useTree();
  return (
    <div className="flex w-max flex-col items-center">
      <TriggerNode />
      <Edge
        tone={
          replay ? (replay.execution.branches?.length ? "hl" : "edge") : "edge"
        }
        insert={view.target}
      />
      <Outcome view={view} />
    </div>
  );
}

function Outcome({ view }: { view: OutcomeView }) {
  if (view.kind === "empty") return <PickNode outcome={view} />;
  if (view.kind === "action") return <ActionNode outcome={view} />;
  return <DecisionBlock view={view} />;
}

/** A vertical link with its arrowhead and, when editable, a "+" to insert a condition. */
function Edge({ tone, insert }: { tone: Tone; insert?: InsertTarget }) {
  const { t } = useTranslation("automations");
  const { editable, insertCondition, canAddBranch } = useTree();
  return (
    <div className="relative flex h-10 w-10 shrink-0 flex-col items-center">
      <span aria-hidden className={cn("flex-1", LINE[tone])} />
      <svg aria-hidden width="10" height="7" className="shrink-0">
        <path d="M0.5 0 L9.5 0 L5 6.5 Z" className={FILL[tone]} />
      </svg>
      {editable && insert && (
        <button
          type="button"
          disabled={!canAddBranch}
          aria-label={t("tree.insertCondition")}
          title={
            canAddBranch
              ? t("tree.insertCondition")
              : t("tree.limitReached", { max: MAX_TREE_BRANCHES })
          }
          onClick={(event) => {
            event.stopPropagation();
            insertCondition(insert);
          }}
          className="absolute left-1/2 top-[45%] flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-80 shadow-sm transition hover:border-primary hover:text-primary hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus aria-hidden className="size-3.5" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

type Lane = { kind: "case"; item: CaseView } | { kind: "otherwise" };

function DecisionBlock({ view }: { view: DecisionView }) {
  const { replay } = useTree();
  const blockRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const lanes: Lane[] = [
    ...view.cases.map((item) => ({ kind: "case" as const, item })),
    { kind: "otherwise" as const },
  ];
  const geometry = useForkGeometry(blockRef, lanesRef, lanes.length);
  const taken = lanes.map((lane) =>
    replay
      ? lane.kind === "case"
        ? caseResult(replay, lane.item.branch.id) === "matched"
        : otherwiseTaken(replay, view)
      : false,
  );
  // In a replay, a lane is lit when followed, dimmed when never tested;
  // a case tested and false keeps its link but dims its outcome.
  const tones = lanes.map((lane, index): { into: Tone; out: Tone } => {
    if (!replay) return { into: "edge", out: "edge" };
    if (taken[index]) return { into: "hl", out: "hl" };
    if (lane.kind === "case") {
      const result = caseResult(replay, lane.item.branch.id);
      if (result === "skipped") return { into: "dim", out: "dim" };
      return { into: "edge", out: "dim" };
    }
    return { into: "dim", out: "dim" };
  });
  return (
    <div ref={blockRef} className="relative flex flex-col items-center">
      <DecisionNode view={view} />
      <Fork
        geometry={geometry}
        tones={tones.map((tone) => tone.into)}
        levelId={view.levelId}
      />
      <div ref={lanesRef} className="flex items-start">
        {lanes.map((lane, index) =>
          lane.kind === "case" ? (
            <div
              key={lane.item.branch.id}
              className="flex flex-col items-center px-3.5"
            >
              <CaseNode item={lane.item} />
              <Edge tone={tones[index].out} insert={lane.item.outcome.target} />
              <Outcome view={lane.item.outcome} />
            </div>
          ) : (
            <div key="otherwise" className="flex flex-col items-center px-3.5">
              <OtherwiseNode view={view} />
              <Edge
                tone={tones[index].out}
                insert={view.otherwise.outcome?.target}
              />
              {view.otherwise.outcome ? (
                <Outcome view={view.otherwise.outcome} />
              ) : (
                <NothingNode view={view} />
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

type ForkGeometry = { width: number; centers: number[] };

/**
 * Where each lane's centre sits, measured after layout from `offsetLeft` —
 * a layout value, so the canvas zoom (a CSS transform) does not skew it. The
 * lanes container stays unpositioned so the lanes' offsets are relative to
 * the decision block itself.
 */
function useForkGeometry(
  blockRef: RefObject<HTMLDivElement | null>,
  lanesRef: RefObject<HTMLDivElement | null>,
  laneCount: number,
): ForkGeometry {
  const [geometry, setGeometry] = useState<ForkGeometry>({
    width: 0,
    centers: [],
  });
  useLayoutEffect(() => {
    const block = blockRef.current;
    const lanes = lanesRef.current;
    if (!block || !lanes) return;
    const measure = () => {
      const centers = Array.from(lanes.children, (child) => {
        const lane = child as HTMLElement;
        return lane.offsetLeft + lane.offsetWidth / 2;
      });
      const width = block.offsetWidth;
      setGeometry((current) =>
        current.width === width &&
        current.centers.length === centers.length &&
        current.centers.every((value, index) => value === centers[index])
          ? current
          : { width, centers },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(lanes);
    for (const child of Array.from(lanes.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [blockRef, lanesRef, laneCount]);
  return geometry;
}

const FORK_HEIGHT = 44;
const BUS_Y = 20;
const RADIUS = 10;

/**
 * The fork under a decision: a stem from the decision, a bar across the
 * lanes, and a drop with an arrow into each lane. Chevrons on the bar give the
 * testing direction; its "+" adds a case just before "otherwise".
 */
function Fork({
  geometry,
  tones,
  levelId,
}: {
  geometry: ForkGeometry;
  tones: Tone[];
  levelId: string;
}) {
  const { t } = useTranslation("automations");
  const { editable, addCase, canAddBranch } = useTree();
  const { width, centers } = geometry;
  if (!width || centers.length < 2)
    return (
      <div
        aria-hidden
        className="self-stretch"
        style={{ height: FORK_HEIGHT }}
      />
    );

  const cx = width / 2;
  const drops = centers.map((x, index) => {
    const tone = tones[index] ?? "edge";
    if (Math.abs(x - cx) < 1)
      return { tone, d: `M${cx} ${BUS_Y} V${FORK_HEIGHT - 7}`, x };
    const sign = x > cx ? 1 : -1;
    return {
      tone,
      x,
      d: `M${cx} ${BUS_Y} H${x - sign * RADIUS} Q${x} ${BUS_Y} ${x} ${BUS_Y + RADIUS} V${FORK_HEIGHT - 7}`,
    };
  });
  const stemTone: Tone = tones.includes("hl")
    ? "hl"
    : tones.every((tone) => tone === "dim")
      ? "dim"
      : "edge";

  // "+" between the last case and "otherwise", clear of the stem.
  const lastCase = centers[centers.length - 2];
  const otherwise = centers[centers.length - 1];
  let addAt = (lastCase + otherwise) / 2;
  if (Math.abs(addAt - cx) < 16) addAt = (cx + otherwise) / 2;

  // One chevron per gap between lanes, away from the stem and the "+".
  const chevrons: number[] = [];
  centers.slice(0, -1).forEach((start, index) => {
    const end = centers[index + 1];
    const segments =
      start < cx && cx < end
        ? [
            [start, cx],
            [cx, end],
          ]
        : [[start, end]];
    for (const [from, to] of segments) {
      if (to - from < 40) continue;
      if (addAt >= from && addAt <= to) continue;
      chevrons.push((from + to) / 2);
    }
  });

  const order: Tone[] = ["dim", "edge", "hl"];
  return (
    <div className="relative self-stretch" style={{ height: FORK_HEIGHT }}>
      <svg
        aria-hidden
        width={width}
        height={FORK_HEIGHT}
        className="absolute left-0 top-0 overflow-visible"
      >
        <path
          d={`M${cx} 0 V${BUS_Y}`}
          fill="none"
          strokeWidth={stemTone === "hl" ? 2.5 : 1.5}
          className={STROKE[stemTone]}
        />
        {order.flatMap((tone) =>
          drops
            .filter((drop) => drop.tone === tone)
            .map((drop) => (
              <g key={`${tone}-${drop.x}`}>
                <path
                  d={drop.d}
                  fill="none"
                  strokeWidth={tone === "hl" ? 2.5 : 1.5}
                  strokeLinecap="round"
                  className={STROKE[tone]}
                />
                <path
                  d={`M${drop.x - 4.5} ${FORK_HEIGHT - 7} L${drop.x + 4.5} ${FORK_HEIGHT - 7} L${drop.x} ${FORK_HEIGHT - 0.5} Z`}
                  className={FILL[tone]}
                />
              </g>
            )),
        )}
        {chevrons.map((x) => (
          <path
            key={`chevron-${x}`}
            d={`M${x - 3} ${BUS_Y - 4.5} L${x + 2} ${BUS_Y} L${x - 3} ${BUS_Y + 4.5}`}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-node-decision"
          />
        ))}
      </svg>
      {editable && (
        <button
          type="button"
          disabled={!canAddBranch}
          aria-label={t("tree.addCase")}
          title={
            canAddBranch
              ? t("tree.addCase")
              : t("tree.limitReached", { max: MAX_TREE_BRANCHES })
          }
          onClick={(event) => {
            event.stopPropagation();
            addCase(levelId);
          }}
          style={{ left: addAt - 12, top: BUS_Y - 12 }}
          className="absolute flex size-6 items-center justify-center rounded-full border border-node-decision/40 bg-card text-node-decision shadow-sm transition hover:border-node-decision hover:bg-node-decision/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:opacity-60"
        >
          <Plus aria-hidden className="size-3.5" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
