import type { Folder } from "@gridone/sdk";

export type FolderIndex = ReadonlyMap<string, Folder>;

export function indexFolders(folders: readonly Folder[]): FolderIndex {
  return new Map(folders.map((folder) => [folder.id, folder]));
}

function compareNames(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Natural, case-insensitive order: « Plan 2 » comes before « Plan 10 ». */
export function compareFolders(a: Folder, b: Folder) {
  return compareNames(a.name, b.name) || a.id.localeCompare(b.id);
}

/** A parent before its children, siblings in natural order. */
function comparePaths(a: readonly string[], b: readonly string[]) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const order = compareNames(a[i]!, b[i]!);
    if (order) return order;
  }
  return a.length - b.length;
}

/** The folder and its ancestors, from the top level down; an unknown id ends
 *  the walk, so a folder deleted meanwhile yields an empty path. */
export function folderPath(
  folderId: string | null | undefined,
  index: FolderIndex,
): Folder[] {
  const path: Folder[] = [];
  let current = folderId ? index.get(folderId) : undefined;
  while (current && !path.includes(current)) {
    path.unshift(current);
    current = current.parent_id ? index.get(current.parent_id) : undefined;
  }
  return path;
}

/** The archived folder that hides this one, as the server reports it in
 *  `hidden_by`. Its contents leave search and the asset or device cards. */
export function hidingFolder(
  folderId: string | null | undefined,
  index: FolderIndex,
): Folder | undefined {
  const hiddenBy = folderId ? index.get(folderId)?.hidden_by : undefined;
  return hiddenBy ? index.get(hiddenBy) : undefined;
}

/** Active folders filed directly in *parentId* (null: the top level). */
export function childFolders(
  parentId: string | null,
  folders: readonly Folder[],
): Folder[] {
  return folders
    .filter(
      (folder) =>
        (folder.parent_id ?? null) === parentId && !folder.archived_at,
    )
    .sort(compareFolders);
}

export function archivedFolders(folders: readonly Folder[]): Folder[] {
  return folders.filter((folder) => folder.archived_at).sort(compareFolders);
}

export interface FolderOption {
  value: string;
  /** Names from the top level down, e.g. ["Plans", "Level 1"]. */
  path: string[];
  hidden: boolean;
}

/** Where a document can be filed: every visible folder, plus *keep* (its
 *  current folder) even when an archived folder hides it, in path order. */
export function folderOptions(
  folders: readonly Folder[],
  keep?: string | null,
): FolderOption[] {
  const index = indexFolders(folders);
  return folders
    .map((folder) => ({
      value: folder.id,
      path: folderPath(folder.id, index).map((f) => f.name),
      hidden: !!folder.hidden_by,
    }))
    .filter((option) => !option.hidden || option.value === keep)
    .sort((a, b) => comparePaths(a.path, b.path));
}
