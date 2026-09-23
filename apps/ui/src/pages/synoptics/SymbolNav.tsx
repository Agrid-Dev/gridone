import { useMemo, useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import type { Severity, SymbolElement } from "@gridone/sdk";
import type { SymbolState } from "@/components/synoptic";
import { FAULT_BG_CLASS } from "@/components/synoptic/fault";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A named symbol of the plate, as the navigation panel lists it. */
export type NavEntry = {
  symbol: SymbolElement;
  name: string;
  /** The type, as the screen reads it. */
  type: string;
  state?: SymbolState;
  /** The device's fault level; null when healthy. */
  fault: Severity | null;
  /** The symbol is a device: selecting it opens its points. */
  device: boolean;
};

type SymbolNavProps = {
  entries: NavEntry[];
  highlightId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (entry: NavEntry) => void;
};

/** Accent- and case-insensitive, so "rechauffeur" finds "RÉCHAUFFEUR". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * The list beside the plate that locates an equipment: a search over the
 * named symbols, each row lit by its run state and its fault. Hovering a
 * row rings the symbol on the plate; selecting one centres the plate on
 * it, and opens its points when it is a device. The plate's own hover
 * lights the row back.
 */
export const SymbolNav: FC<SymbolNavProps> = ({
  entries,
  highlightId,
  onHover,
  onSelect,
}) => {
  const { t } = useTranslation("synoptics");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return entries;
    return entries.filter(
      (e) => fold(e.name).includes(needle) || fold(e.type).includes(needle),
    );
  }, [entries, query]);

  return (
    <nav
      aria-label={t("nav.title")}
      className="flex w-60 shrink-0 flex-col border-r border-border"
    >
      <div className="relative border-b border-border p-2">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("nav.search")}
          aria-label={t("nav.search")}
          className="h-8 pl-8 text-sm"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1" role="list">
        {shown.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            {t("nav.empty")}
          </li>
        )}
        {shown.map((entry) => (
          <li key={entry.symbol.id}>
            <button
              type="button"
              data-nav-symbol={entry.symbol.id}
              data-highlighted={entry.symbol.id === highlightId || undefined}
              onMouseEnter={() => onHover(entry.symbol.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(entry.symbol.id)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(entry)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
                entry.symbol.id === highlightId && "bg-muted",
              )}
            >
              <span
                aria-hidden
                data-state={entry.fault ? "fault" : (entry.state ?? "unknown")}
                data-fault={entry.fault ?? undefined}
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  entry.fault
                    ? FAULT_BG_CLASS[entry.fault]
                    : entry.state === "on"
                      ? "bg-status-ok"
                      : entry.state === "off"
                        ? "bg-muted-foreground"
                        : "border border-dashed border-muted-foreground",
                )}
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {entry.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {entry.type}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};
