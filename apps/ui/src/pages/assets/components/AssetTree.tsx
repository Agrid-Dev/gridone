import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  Building2,
  Layers,
  DoorOpen,
  MapPin,
  Globe,
  GripVertical,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AssetTreeNode } from "@/api/assets";

const typeIcons: Record<string, typeof Building2> = {
  org: Globe,
  building: Building2,
  floor: Layers,
  room: DoorOpen,
  zone: MapPin,
};

/** Collect all descendant IDs for a given node (excluding itself). */
function collectDescendantIds(node: AssetTreeNode): Set<string> {
  const ids = new Set<string>();
  for (const child of node.children) {
    ids.add(child.id);
    for (const id of collectDescendantIds(child)) {
      ids.add(id);
    }
  }
  return ids;
}

/** Find a node by ID in the tree. */
function findNode(
  roots: AssetTreeNode[],
  id: string,
): AssetTreeNode | undefined {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNode(root.children, id);
    if (found) return found;
  }
  return undefined;
}

function TreeNode({
  node,
  depth,
  activeId,
  invalidDropIds,
}: {
  node: AssetTreeNode;
  depth: number;
  activeId: string | null;
  invalidDropIds: Set<string>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const Icon = typeIcons[node.type] ?? Building2;

  const isRoot = node.parentId === null;
  const isDragging = activeId === node.id;
  const isInvalidDrop = invalidDropIds.has(node.id);

  // Draggable — root cannot be dragged
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: node.id,
    disabled: isRoot,
  });

  // Droppable — every node can be a drop target (except invalid ones)
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: node.id,
    disabled: isInvalidDrop,
  });

  const isValidDropTarget = activeId && isOver && !isInvalidDrop;

  return (
    <div ref={setDropRef}>
      <div
        ref={setDragRef}
        className={`flex items-center gap-2 py-2 px-3 rounded-md transition-colors ${
          isDragging
            ? "opacity-40"
            : isValidDropTarget
              ? "bg-blue-50 ring-2 ring-blue-400 ring-inset"
              : "hover:bg-slate-50"
        }`}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        {/* Drag handle */}
        {!isRoot ? (
          <button
            className="flex items-center justify-center h-5 w-5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
            {...dragListeners}
            {...dragAttributes}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="w-5" />
        )}

        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-center h-5 w-5 text-slate-400 hover:text-slate-600"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <Icon className="h-4 w-4 text-slate-500" />
        <Link
          to={`/assets/${node.id}`}
          className="text-sm font-medium text-slate-900 hover:underline underline-offset-2"
        >
          {node.name}
        </Link>
        <Badge variant="outline" className="text-xs">
          {t(`assets.types.${node.type}`, { defaultValue: node.type })}
        </Badge>
      </div>
      {expanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            activeId={activeId}
            invalidDropIds={invalidDropIds}
          />
        ))}
    </div>
  );
}

/** Ghost node shown during drag. */
function DragOverlayContent({ node }: { node: AssetTreeNode }) {
  const { t } = useTranslation();
  const Icon = typeIcons[node.type] ?? Building2;

  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <GripVertical className="h-3.5 w-3.5 text-slate-400" />
      <Icon className="h-4 w-4 text-slate-500" />
      <span className="text-sm font-medium text-slate-900">{node.name}</span>
      <Badge variant="outline" className="text-xs">
        {t(`assets.types.${node.type}`, { defaultValue: node.type })}
      </Badge>
    </div>
  );
}

type AssetTreeProps = {
  tree: AssetTreeNode[];
  onMove?: (assetId: string, newParentId: string) => void;
};

export function AssetTree({ tree, onMove }: AssetTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Require a small movement before starting drag (avoids accidental drags on click)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  // Compute which IDs are invalid drop targets for the active node
  const invalidDropIds = useMemo(() => {
    if (!activeId) return new Set<string>();
    const activeNode = findNode(tree, activeId);
    if (!activeNode) return new Set<string>();
    // Cannot drop onto self or any descendant
    const ids = collectDescendantIds(activeNode);
    ids.add(activeId);
    // Cannot drop onto current parent (no-op)
    if (activeNode.parentId) ids.add(activeNode.parentId);
    return ids;
  }, [activeId, tree]);

  const activeNode = activeId ? findNode(tree, activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !onMove) return;
    const draggedId = String(active.id);
    const targetId = String(over.id);

    // Skip if dropping on self, descendant, or current parent
    if (invalidDropIds.has(targetId)) return;
    if (draggedId === targetId) return;

    onMove(draggedId, targetId);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div>
        {tree.map((root) => (
          <TreeNode
            key={root.id}
            node={root}
            depth={0}
            activeId={activeId}
            invalidDropIds={invalidDropIds}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeNode ? <DragOverlayContent node={activeNode} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
