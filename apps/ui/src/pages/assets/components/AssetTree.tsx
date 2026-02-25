import type { FocusEvent } from "react";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
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
import { arrayMove } from "@dnd-kit/sortable";
import {
  ChevronDown,
  ChevronRight,
  Building2,
  Layers,
  DoorOpen,
  MapPin,
  Globe,
  GripVertical,
  Plus,
  Pencil,
  Cpu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AssetTreeNode } from "@/api/assets";
import { ASSET_TYPES } from "@/api/assets";

const typeIcons: Record<string, typeof Building2> = {
  org: Globe,
  building: Building2,
  floor: Layers,
  room: DoorOpen,
  zone: MapPin,
};

/** Tailwind classes for each asset type badge. */
const typeBadgeColors: Record<string, string> = {
  org: "border-purple-200 bg-purple-50 text-purple-700",
  building: "border-blue-200 bg-blue-50 text-blue-700",
  floor: "border-amber-200 bg-amber-50 text-amber-700",
  room: "border-emerald-200 bg-emerald-50 text-emerald-700",
  zone: "border-rose-200 bg-rose-50 text-rose-700",
};

/** Suggested child type given the parent type. */
const nextTypeMap: Record<string, string> = {
  org: "building",
  building: "floor",
  floor: "room",
  room: "zone",
  zone: "zone",
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

/** Build a flat map of nodeId -> list of sibling IDs (children of the same parent). */
function buildSiblingMap(roots: AssetTreeNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  function walk(children: AssetTreeNode[]) {
    const ids = children.map((c) => c.id);
    for (const child of children) {
      map.set(child.id, ids);
      walk(child.children);
    }
  }
  walk(roots);
  return map;
}

const EXPANDED_STORAGE_KEY = "asset-tree-expanded";

/** Collect IDs of nodes at depth < maxDepth (used for default expanded set). */
function collectDefaultExpanded(
  roots: AssetTreeNode[],
  maxDepth = 2,
): Set<string> {
  const ids = new Set<string>();
  function walk(nodes: AssetTreeNode[], depth: number) {
    for (const node of nodes) {
      if (depth < maxDepth) {
        ids.add(node.id);
        walk(node.children, depth + 1);
      }
    }
  }
  walk(roots, 0);
  return ids;
}

function loadExpandedIds(): Set<string> | null {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return null;
  }
}

function saveExpandedIds(ids: Set<string>) {
  localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...ids]));
}

/* ------------------------------------------------------------------ */
/*  Inline "add child" row                                            */
/* ------------------------------------------------------------------ */

function InlineCreateRow({
  depth,
  parentType,
  onConfirm,
  onCancel,
}: {
  depth: number;
  parentType: string;
  onConfirm: (name: string, type: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState(nextTypeMap[parentType] ?? "zone");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed, type);
    else onCancel();
  };

  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    // If focus is moving to another element inside this row, do nothing
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    submit();
  };

  return (
    <div
      className="flex items-center gap-2 py-2 px-3"
      style={{ paddingLeft: `${depth * 24 + 12}px` }}
      onBlur={handleBlur}
    >
      <span className="w-5" />
      <span className="w-5" />
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="h-7 rounded border border-slate-300 bg-white px-1 text-xs"
      >
        {ASSET_TYPES.map((at) => (
          <option key={at} value={at}>
            {t(`assets.types.${at}`, { defaultValue: at })}
          </option>
        ))}
      </select>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={t("assets.inlineCreate.placeholder")}
        className="h-7 flex-1 rounded border border-slate-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tree node                                                          */
/* ------------------------------------------------------------------ */

function TreeNode({
  node,
  depth,
  activeId,
  invalidDropIds,
  addingChildOf,
  setAddingChildOf,
  expandedIds,
  toggleExpanded,
  onCreateChild,
  onRename,
}: {
  node: AssetTreeNode;
  depth: number;
  activeId: string | null;
  invalidDropIds: Set<string>;
  addingChildOf: string | null;
  setAddingChildOf: (id: string | null) => void;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  onCreateChild?: (parentId: string, name: string, type: string) => void;
  onRename?: (assetId: string, newName: string) => void;
}) {
  const { t } = useTranslation();
  const expanded = expandedIds.has(node.id);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const hasChildren = node.children.length > 0;
  const hasDevices = (node.devices?.length ?? 0) > 0;
  const isExpandable = hasChildren || hasDevices || addingChildOf === node.id;
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

  // Auto-expand when this node is selected for adding a child
  useEffect(() => {
    if (addingChildOf === node.id && !expanded) toggleExpanded(node.id);
  }, [addingChildOf, node.id, expanded, toggleExpanded]);

  // Auto-focus rename input
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const submitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.name && onRename) {
      onRename(node.id, trimmed);
    }
    setIsRenaming(false);
    setRenameValue(node.name);
  };

  return (
    <div ref={setDropRef}>
      <div
        ref={setDragRef}
        className={`group flex items-center gap-2 py-2 px-3 rounded-md transition-colors ${
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
        {isExpandable ? (
          <button
            onClick={() => toggleExpanded(node.id)}
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

        {/* Name — inline rename or link */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setIsRenaming(false);
                setRenameValue(node.name);
              }
            }}
            onBlur={submitRename}
            className="h-7 flex-1 rounded border border-slate-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        ) : (
          <Link
            to={`/assets/${node.id}`}
            className="text-sm font-medium text-slate-900 hover:underline underline-offset-2"
          >
            {node.name}
          </Link>
        )}

        <Badge
          variant="outline"
          className={`text-xs ${typeBadgeColors[node.type] ?? ""}`}
        >
          {t(`assets.types.${node.type}`, { defaultValue: node.type })}
        </Badge>

        {/* Hover actions */}
        {!isRenaming && (
          <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onRename && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setRenameValue(node.name);
                  setIsRenaming(true);
                }}
                className="flex items-center justify-center h-6 w-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                title={t("assets.edit")}
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {onCreateChild && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setAddingChildOf(node.id);
                }}
                className="flex items-center justify-center h-6 w-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                title={t("assets.addChild")}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        )}
      </div>

      {/* Children + inline create + devices */}
      {expanded && (
        <>
          {addingChildOf === node.id && onCreateChild && (
            <InlineCreateRow
              depth={depth + 1}
              parentType={node.type}
              onConfirm={(name, type) => {
                onCreateChild(node.id, name, type);
                setAddingChildOf(null);
              }}
              onCancel={() => setAddingChildOf(null)}
            />
          )}
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              invalidDropIds={invalidDropIds}
              addingChildOf={addingChildOf}
              setAddingChildOf={setAddingChildOf}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              onCreateChild={onCreateChild}
              onRename={onRename}
            />
          ))}
          {node.devices?.map((device) => (
            <div
              key={`device-${device.id}`}
              className="flex items-center gap-2 py-1.5 px-3"
              style={{ paddingLeft: `${(depth + 1) * 24 + 12}px` }}
            >
              <span className="w-5" />
              <span className="w-5" />
              <Cpu className="h-3.5 w-3.5 text-slate-400" />
              <Link
                to={`/devices/${device.id}`}
                className="text-sm text-slate-500 hover:underline underline-offset-2"
              >
                {device.name}
              </Link>
            </div>
          ))}
        </>
      )}
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
      <Badge
        variant="outline"
        className={`text-xs ${typeBadgeColors[node.type] ?? ""}`}
      >
        {t(`assets.types.${node.type}`, { defaultValue: node.type })}
      </Badge>
    </div>
  );
}

type AssetTreeProps = {
  tree: AssetTreeNode[];
  onMove?: (assetId: string, newParentId: string) => void;
  onCreateChild?: (parentId: string, name: string, type: string) => void;
  onRename?: (assetId: string, newName: string) => void;
  onReorder?: (parentId: string, orderedIds: string[]) => void;
};

export function AssetTree({
  tree,
  onMove,
  onCreateChild,
  onRename,
  onReorder,
}: AssetTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);

  // Expanded state — persisted to localStorage
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    return loadExpandedIds() ?? collectDefaultExpanded(tree);
  });

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveExpandedIds(next);
      return next;
    });
  }, []);

  // Require a small movement before starting drag (avoids accidental drags on click)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  // Build a sibling map for reorder detection
  const siblingMap = useMemo(() => buildSiblingMap(tree), [tree]);

  // Compute which IDs are invalid drop targets for the active node
  const invalidDropIds = useMemo(() => {
    if (!activeId) return new Set<string>();
    const activeNode = findNode(tree, activeId);
    if (!activeNode) return new Set<string>();
    // Cannot drop onto self or any descendant
    const ids = collectDescendantIds(activeNode);
    ids.add(activeId);
    return ids;
  }, [activeId, tree]);

  const activeNode = activeId ? findNode(tree, activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;
    const draggedId = String(active.id);
    const targetId = String(over.id);

    if (invalidDropIds.has(targetId)) return;
    if (draggedId === targetId) return;

    const draggedNode = findNode(tree, draggedId);
    const targetNode = findNode(tree, targetId);
    if (!draggedNode || !targetNode) return;

    // Same parent → sibling reorder
    if (
      draggedNode.parentId &&
      draggedNode.parentId === targetNode.parentId &&
      onReorder
    ) {
      const siblings = siblingMap.get(draggedId) ?? [];
      const oldIndex = siblings.indexOf(draggedId);
      const newIndex = siblings.indexOf(targetId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(siblings, oldIndex, newIndex);
        onReorder(draggedNode.parentId, newOrder);
      }
      return;
    }

    // Different parent → reparent
    if (onMove) {
      onMove(draggedId, targetId);
    }
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
            addingChildOf={addingChildOf}
            setAddingChildOf={setAddingChildOf}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
            onCreateChild={onCreateChild}
            onRename={onRename}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeNode ? <DragOverlayContent node={activeNode} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
