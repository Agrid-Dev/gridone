import { useMemo, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Search, Spline } from "lucide-react";
import { SymbolThumb } from "@/components/synoptic/symbols/SymbolThumb";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { usePlateVocabulary } from "../usePlateVocabulary";
import { libraryGroups, matchesQuery, SYMBOL_DRAG_TYPE } from "./library";
import { capitalize } from "./names";
import type { SynopticEditorState } from "./useSynopticEditor";

/**
 * The symbols the plate can hold, on shelves by what they do, named as the
 * plate names them. A row is dragged onto the plan, or clicked to arm it
 * for the next click there (the way in from a keyboard or a touch screen).
 * The shelf of types that ride a pipe says so, since that is how they are
 * placed.
 */
export function SymbolLibrary({
  editor,
  searchRef,
}: {
  editor: SynopticEditorState;
  searchRef: RefObject<HTMLInputElement>;
}) {
  const { t } = useTranslation("synoptics");
  const vocabulary = usePlateVocabulary();
  const [query, setQuery] = useState("");
  const nameOf = (type: string) => capitalize(vocabulary.typeLabel(type));
  const groups = useMemo(
    () =>
      libraryGroups()
        .map((group) => ({
          ...group,
          types: group.types.filter((type) =>
            matchesQuery(type, vocabulary.typeLabel(type), query),
          ),
        }))
        .filter((group) => group.types.length > 0),
    [query, vocabulary],
  );

  return (
    <aside
      aria-label={t("editor.library.title")}
      className="flex w-64 shrink-0 flex-col border-r bg-card"
    >
      <div className="space-y-2.5 p-3 pb-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-base font-semibold">
            {t("editor.library.title")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t("editor.library.hint")}
          </span>
        </div>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            type="search"
            aria-label={t("editor.library.search")}
            placeholder={t("editor.library.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            className="h-9 pl-8 pr-8"
          />
          <Kbd className="absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`shelf-${group.id}`}>
            <div className="px-1.5 pb-1 pt-3">
              <h3
                id={`shelf-${group.id}`}
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {t(`editor.library.groups.${group.id}`)}
              </h3>
              {group.id === "onPipe" && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-primary">
                  <Spline aria-hidden className="size-3" />
                  {t("editor.library.onPipe")}
                </p>
              )}
            </div>
            <ul className="space-y-0.5">
              {group.types.map((type) => {
                const armed = editor.placing === type;
                return (
                  <li key={type}>
                    <button
                      type="button"
                      draggable
                      aria-pressed={armed}
                      data-library-type={type}
                      onClick={() => editor.arm(armed ? null : type)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(SYMBOL_DRAG_TYPE, type);
                        e.dataTransfer.effectAllowed = "copy";
                        editor.setDragType(type);
                      }}
                      onDragEnd={() => editor.setDragType(null)}
                      className={cn(
                        "flex h-10 w-full cursor-grab items-center gap-2.5 rounded-md border px-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
                        armed
                          ? "border-primary bg-primary/10"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-synoptic-plate">
                        <SymbolThumb
                          type={type}
                          height={24}
                          className="bg-transparent"
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {nameOf(type)}
                      </span>
                      <GripVertical
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground/60"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="px-1.5 pt-4 text-sm text-muted-foreground">
            {t("editor.library.empty")}
          </p>
        )}
      </div>
    </aside>
  );
}
