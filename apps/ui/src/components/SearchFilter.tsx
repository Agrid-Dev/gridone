import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { useDebouncedSearchParam } from "@/hooks/useDebouncedSearchParam";
import { useFocusHotkey } from "@/hooks/useFocusHotkey";

const SEARCH_PARAM = "search";
const FOCUS_HOTKEY = "/";

export function SearchFilter() {
  const { t } = useTranslation("devices");
  const { value, setValue, clear } = useDebouncedSearchParam(SEARCH_PARAM);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusHotkey(FOCUS_HOTKEY, inputRef);

  return (
    <div className="relative w-full max-w-xs lg:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("devices.search.placeholder")}
        aria-label={t("devices.search.label")}
        aria-keyshortcuts={FOCUS_HOTKEY}
        className="h-9 pl-9 pr-9"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("devices.search.clear")}
          onClick={clear}
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground sm:inline-flex"
        >
          {FOCUS_HOTKEY}
        </kbd>
      )}
    </div>
  );
}
