import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { SynopticSummary } from "@gridone/sdk";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const NONE = "__none__";
const optionValue = (s: SynopticSummary) =>
  `${s.name} ${s.description ?? ""} ${s.id}`.trim();

/**
 * The view a link leads to, found by name: the site's views in a list with
 * a search over it, the chosen one checked. A link to no view stays inert
 * on the plate, as the committed plates keep theirs until the target
 * exists.
 */
export function LinkTargetList({
  value,
  synoptics,
  onChange,
  label,
  allowNone = true,
}: {
  value: string | null;
  synoptics: SynopticSummary[];
  onChange: (id: string | null) => void;
  /** What the list picks, for a screen reader; a link's target by default. */
  label?: string;
  /** Whether "no view" is a choice. */
  allowNone?: boolean;
}) {
  const { t } = useTranslation("synoptics");
  const current = synoptics.find((s) => s.id === value);
  return (
    <Command
      label={label ?? t("editor.link.target")}
      className="rounded-md border"
      defaultValue={current ? optionValue(current) : NONE}
    >
      <CommandInput placeholder={t("editor.link.search")} />
      <CommandList className="max-h-56">
        <CommandEmpty>{t("switcher.empty")}</CommandEmpty>
        <CommandGroup>
          {allowNone && (
            <CommandItem value={NONE} onSelect={() => onChange(null)}>
              <Check
                aria-hidden
                className={cn(value ? "opacity-0" : "opacity-100")}
              />
              <span className="text-muted-foreground">
                {t("editor.link.none")}
              </span>
            </CommandItem>
          )}
          {synoptics.map((synoptic) => (
            <CommandItem
              key={synoptic.id}
              value={optionValue(synoptic)}
              data-link-option={synoptic.id}
              onSelect={() => onChange(synoptic.id)}
            >
              <Check
                aria-hidden
                className={cn(
                  synoptic.id === value ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="truncate">{synoptic.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
