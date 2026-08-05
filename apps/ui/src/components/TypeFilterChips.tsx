import { useSearchParams } from "react-router";
import { cn } from "@/lib/utils";

export type TypeFilterOption = {
  /** Value written to the `?type=` query param. */
  key: string;
  label: string;
  count: number;
};

type TypeFilterChipsProps = {
  /** Buckets to offer, in display order. Callers pass non-empty buckets
   *  only — a chip that always yields an empty list is noise. */
  options: TypeFilterOption[];
  /** Unfiltered resource count, shown on the leading "all" chip. */
  total: number;
  allLabel: string;
  ariaLabel: string;
  /** Optional controlled mode for filters that do not use the `type` query
   *  parameter. `null` selects the leading "all" chip. */
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
};

/** Row of resource filter chips ("Tous les types 7", "Thermostat 4", …).
 *  It drives `?type=` by default and supports controlled selection for other
 *  resource dimensions, such as user roles. */
export function TypeFilterChips({
  options,
  total,
  allLabel,
  ariaLabel,
  selectedKey,
  onSelect,
}: TypeFilterChipsProps) {
  if (onSelect) {
    return (
      <FilterChips
        options={options}
        total={total}
        allLabel={allLabel}
        ariaLabel={ariaLabel}
        selected={selectedKey ?? null}
        select={onSelect}
      />
    );
  }

  return (
    <QueryParamTypeFilterChips
      options={options}
      total={total}
      allLabel={allLabel}
      ariaLabel={ariaLabel}
    />
  );
}

function QueryParamTypeFilterChips({
  options,
  total,
  allLabel,
  ariaLabel,
}: Omit<TypeFilterChipsProps, "selectedKey" | "onSelect">) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("type");

  const select = (key: string | null) => {
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      if (key === null) updated.delete("type");
      else updated.set("type", key);
      return updated;
    });
  };

  return (
    <FilterChips
      options={options}
      total={total}
      allLabel={allLabel}
      ariaLabel={ariaLabel}
      selected={selected}
      select={select}
    />
  );
}

function FilterChips({
  options,
  total,
  allLabel,
  ariaLabel,
  selected,
  select,
}: Omit<TypeFilterChipsProps, "selectedKey" | "onSelect"> & {
  selected: string | null;
  select: (key: string | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-2"
    >
      <Chip
        label={allLabel}
        count={total}
        active={selected === null}
        onClick={() => select(null)}
      />
      {options.map(({ key, label, count }) => (
        <Chip
          key={key}
          label={label}
          count={count}
          active={selected === key}
          onClick={() => select(key)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          active ? "text-primary-foreground/70" : "text-muted-foreground/70",
        )}
      >
        {count}
      </span>
    </button>
  );
}
