import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { useCommandHotkey } from "@/hooks/useCommandHotkey";
import { AssetSearchDialog } from "./AssetSearchDialog";

/** Search affordance in the topbar: a button dressed as an input, opening the
 *  zone palette on click or ⌘K.
 *
 *  The dialog is not rendered until the first open, so the asset tree is not
 *  fetched on routes that never need it. Once mounted it stays mounted, so the
 *  query cache keeps every subsequent open instant. */
export function AssetSearch() {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  const openPalette = useCallback(() => {
    setHasOpened(true);
    setOpen(true);
  }, []);

  useCommandHotkey(openPalette);

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-label={t("topbar.search.label")}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-9 w-full max-w-xs items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 lg:max-w-sm"
      >
        <Search aria-hidden className="h-4 w-4 shrink-0" />
        <span className="truncate">{t("topbar.search.placeholder")}</span>
        <kbd
          aria-hidden
          className="ml-auto hidden h-5 select-none items-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium sm:inline-flex"
        >
          ⌘K
        </kbd>
      </button>

      {hasOpened && <AssetSearchDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
