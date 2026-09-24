import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConditionPhrase } from "@/pages/devices/device/operating-rules/RuleSentence";
import type { CaseView, DecisionView } from "../tree/model";
import { useTree } from "../tree/TreeContext";

/**
 * The cases of one decision in the order they are tested, draggable by their
 * handle (pointer or keyboard). "Otherwise" closes the list and never moves.
 */
export function CaseOrder({
  decision,
  current,
  onMove,
  onAdd,
}: {
  decision: DecisionView;
  /** The case whose panel is open, highlighted in the list. */
  current?: string;
  onMove: (branchId: string, to: number) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation("automations");
  const { editable, select, canAddBranch } = useTree();
  const ids = decision.cases.map((item) => item.branch.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const to = ids.indexOf(String(over.id));
    if (to >= 0) onMove(String(active.id), to);
  };
  const otherwise = decision.otherwise;
  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="m-0 list-none space-y-1.5 p-0">
            {decision.cases.map((item, index) => (
              <CaseRow
                key={item.branch.id}
                item={item}
                ordinal={index + 1}
                current={item.branch.id === current}
                sortable={editable && ids.length > 1}
                onSelect={() =>
                  select({ kind: "case", branchId: item.branch.id })
                }
              />
            ))}
            <li className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pl-2 pr-3">
              <span className="flex w-7 justify-center" aria-hidden>
                <Lock className="size-3.5 text-muted-foreground" />
              </span>
              <button
                type="button"
                onClick={() =>
                  select({ kind: "otherwise", levelId: decision.levelId })
                }
                className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-[13.5px] font-semibold">
                  {t("tree.otherwise")}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {otherwise.branch
                    ? t("panel.order.otherwiseAction")
                    : t("panel.order.otherwiseNothing")}
                </span>
              </button>
            </li>
          </ol>
        </SortableContext>
      </DndContext>
      {editable && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAddBranch}
          onClick={onAdd}
          className="border-node-decision/40 text-node-decision hover:bg-node-decision/10 hover:text-node-decision"
        >
          <Plus aria-hidden />
          {t("tree.addCase")}
        </Button>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        {t("panel.order.help")}
      </p>
    </div>
  );
}

function CaseRow({
  item,
  ordinal,
  current,
  sortable,
  onSelect,
}: {
  item: CaseView;
  ordinal: number;
  current: boolean;
  sortable: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("automations");
  const { catalog, incompleteConditions } = useTree();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.branch.id, disabled: !sortable });
  const name =
    item.branch.name || t("panel.case.untitled", { position: ordinal });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-current={current || undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card py-1.5 pl-1 pr-3",
        current && "border-primary bg-accent",
        isDragging && "relative z-10 shadow-lg ring-1 ring-border",
      )}
    >
      {sortable ? (
        <button
          type="button"
          aria-label={t("panel.order.drag", { name })}
          className="flex w-7 cursor-grab touch-none justify-center self-stretch rounded-md text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      ) : (
        <span className="w-7" aria-hidden />
      )}
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-node-decision/15 text-[11px] font-bold text-node-decision"
      >
        {ordinal}
      </span>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-[13.5px] font-semibold">{name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {!item.branch.condition ? (
            t("tree.alwaysTrue")
          ) : incompleteConditions.has(item.branch.id) ? (
            <span className="text-amber-700">{t("tree.chooseCondition")}</span>
          ) : (
            <ConditionPhrase value={item.branch.condition} catalog={catalog} />
          )}
        </span>
      </button>
    </li>
  );
}
