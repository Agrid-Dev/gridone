import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type Over,
} from "@dnd-kit/core";
import { FileText } from "lucide-react";
import type { Document, Folder } from "@gridone/sdk";
import type { MoveRequest } from "./useDocuments";

interface DragData {
  document: Document;
}

interface DropData {
  /** Null is the top level. */
  folder: Folder | null;
}

function draggedDocument(active: Active | null) {
  return (active?.data.current as DragData | undefined)?.document;
}

/** The move a drop asks for, or null when the document lands outside any
 *  folder or in the folder it is already filed in. */
export function dropMove(
  active: Active | null,
  over: Over | null,
): MoveRequest | null {
  const document = draggedDocument(active);
  const target = over?.data.current as DropData | undefined;
  if (!document || !target) return null;
  return (target.folder?.id ?? null) === (document.folder_id ?? null)
    ? null
    : { document, folder: target.folder };
}

/** Lets document rows be dropped on folder rows and breadcrumb segments.
 *  Pointer only: from a keyboard or a tablet, the document form's Folder field
 *  does the same; a drop beside any folder moves nothing. */
export function DocumentsDrag({
  onMove,
  children,
}: {
  onMove: (move: MoveRequest) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [dragged, setDragged] = useState<Document | null>(null);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setDragged(draggedDocument(active) ?? null)}
      onDragEnd={({ active, over }) => {
        setDragged(null);
        const move = dropMove(active, over);
        if (move) onMove(move);
      }}
      onDragCancel={() => setDragged(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="flex max-w-xs items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium shadow-md">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{dragged.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** Pointer listeners only: the row keeps its table semantics, its links and
 *  its buttons. */
export function useDocumentDrag(document: Document, disabled: boolean) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `document:${document.id}`,
    data: { document } satisfies DragData,
    disabled,
  });
  return { ref: setNodeRef, listeners, isDragging };
}

export function useFolderDrop(folder: Folder | null, disabled: boolean) {
  const { setNodeRef, isOver } = useDroppable({
    id: folder ? `folder:${folder.id}` : "top-level",
    data: { folder } satisfies DropData,
    disabled,
  });
  return { ref: setNodeRef, isOver };
}
