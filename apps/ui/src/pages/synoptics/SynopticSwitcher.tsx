import { useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Star,
} from "lucide-react";
import type { SynopticSummary } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type SwitcherProps = {
  /** The plate on screen. */
  current: { id: string; name: string };
  /** Every stored plate, in list order. */
  synoptics: SynopticSummary[];
  /** The plate `/synoptics` opens on, if one is pinned. */
  pinned: string | null;
  onNavigate: (id: string) => void;
};

/** What the menu's search matches a plate on; the id keeps it unique.
 *  Trimmed as cmdk trims an item's value but not `defaultValue`: a name
 *  with a leading space would otherwise open the cursor on nothing. */
const optionValue = (s: {
  id: string;
  name: string;
  description?: string | null;
}) => `${s.name} ${s.description ?? ""} ${s.id}`.trim();

/**
 * The plate's title, as a menu of the other plates: a search over their
 * names and descriptions, the current one checked and the pinned one
 * starred. Picking one opens it, so the page never has to leave a plate
 * to reach the next. The keyboard cursor opens on the current plate, so
 * an arrow key reaches its neighbours.
 */
export const SynopticSwitcher: FC<SwitcherProps> = ({
  current,
  synoptics,
  pinned,
  onNavigate,
}) => {
  const { t } = useTranslation("synoptics");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-synoptic-switcher
          className="-ml-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
        >
          <span className="truncate">{current.name}</span>
          <ChevronDown
            aria-hidden
            className="h-5 w-5 shrink-0 text-muted-foreground"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <Command
          label={t("switcher.label")}
          defaultValue={optionValue(
            synoptics.find((s) => s.id === current.id) ?? current,
          )}
        >
          <CommandInput placeholder={t("switcher.search")} />
          <CommandList className="max-h-96">
            <CommandEmpty>{t("switcher.empty")}</CommandEmpty>
            <CommandGroup>
              {synoptics.map((synoptic) => (
                <CommandItem
                  key={synoptic.id}
                  value={optionValue(synoptic)}
                  data-synoptic-option={synoptic.id}
                  onSelect={() => {
                    setOpen(false);
                    if (synoptic.id !== current.id) onNavigate(synoptic.id);
                  }}
                >
                  <Check
                    aria-hidden
                    className={cn(
                      synoptic.id === current.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {synoptic.name}
                    </span>
                    {synoptic.id === current.id && (
                      <span className="sr-only">{t("switcher.current")}</span>
                    )}
                    {synoptic.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {synoptic.description}
                      </span>
                    )}
                  </span>
                  {synoptic.id === pinned && (
                    <>
                      <Star
                        aria-hidden
                        className="fill-amber-400 text-amber-500"
                      />
                      <span className="sr-only">{t("switcher.pinned")}</span>
                    </>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

type StepperProps = SwitcherProps & {
  onPin: (id: string | null) => void;
};

/**
 * Beside the title: the previous and next plates in list order (wrapping,
 * so the last leads back to the first), where the current one stands, and
 * the star that makes it the plate `/synoptics` opens on.
 */
export const SynopticStepper: FC<StepperProps> = ({
  current,
  synoptics,
  pinned,
  onNavigate,
  onPin,
}) => {
  const { t } = useTranslation("synoptics");
  const index = synoptics.findIndex((s) => s.id === current.id);
  const total = synoptics.length;
  const step = (by: number) =>
    onNavigate(synoptics[(index + by + total) % total].id);
  const isPinned = pinned === current.id;

  return (
    <div className="flex items-center gap-1">
      {index >= 0 && total > 1 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("switcher.previous")}
            onClick={() => step(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span
            data-synoptic-position
            className="text-sm tabular-nums text-muted-foreground"
          >
            {t("switcher.position", { position: index + 1, total })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("switcher.next")}
            onClick={() => step(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("switcher.pin")}
        aria-pressed={isPinned}
        title={t("switcher.pin")}
        onClick={() => onPin(isPinned ? null : current.id)}
      >
        <Star
          className={cn(
            "h-4 w-4",
            isPinned
              ? "fill-amber-400 text-amber-500"
              : "text-muted-foreground",
          )}
        />
      </Button>
    </div>
  );
};
