import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { Folder } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { cn } from "@/lib/utils";
import { useFolderDrop } from "./documentDrag";
import { folderLink } from "./useDocuments";

function Crumb({
  folder,
  label,
  droppable,
}: {
  folder: Folder | null;
  label: string;
  droppable: boolean;
}) {
  const drop = useFolderDrop(folder, !droppable);
  return (
    <>
      <span
        ref={drop.ref}
        className={cn(
          "-mx-1 min-w-0 rounded-md px-1",
          drop.isOver && "bg-primary/10 text-primary",
        )}
      >
        <Link
          to={folderLink(folder?.id ?? null)}
          className="break-words hover:text-foreground"
        >
          {label}
        </Link>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
    </>
  );
}

/** The folders above the open one, on the page title's line, the way a drive
 *  shows its path: « Documents › Plans › » and then the title. Each one opens
 *  its folder and, while a document is dragged, takes it there. */
export function DocumentsBreadcrumb({
  ancestors,
  droppable,
}: {
  ancestors: readonly Folder[];
  droppable: boolean;
}) {
  const { t } = useTranslation("documents");
  return (
    <nav
      aria-label={t("breadcrumb")}
      className="flex min-w-0 flex-wrap items-center gap-1.5 font-display text-xl font-medium text-muted-foreground"
    >
      <Crumb folder={null} label={t("title")} droppable={droppable} />
      {ancestors.map((folder) => (
        <Crumb
          key={folder.id}
          folder={folder}
          label={folder.name}
          droppable={droppable}
        />
      ))}
    </nav>
  );
}
