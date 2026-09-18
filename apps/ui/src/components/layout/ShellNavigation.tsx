import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMobileNavigation } from "@/hooks/useMobileNavigation";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function ShellNavigation() {
  const { t } = useTranslation();
  const { open, setOpen, onNavigate, onCloseAutoFocus } = useMobileNavigation();
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <TopBar
        menu={
          <Dialog.Trigger asChild>
            <Button variant="outline" className="min-h-11 lg:hidden">
              <Menu className="h-4 w-4" />
              {t("navigation.menu")}
            </Button>
          </Dialog.Trigger>
        }
      />
      <Sidebar />
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed inset-y-0 left-0 z-50 h-dvh w-64 max-w-[calc(100vw-2rem)] bg-sidebar shadow-xl"
        >
          <Dialog.Title className="sr-only">{t("nav.main")}</Dialog.Title>
          <Tooltip>
            <TooltipTrigger asChild>
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 z-10 h-11 w-11"
                  aria-label={t("navigation.closeMenu")}
                  title={t("navigation.closeMenu")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("navigation.closeMenu")}
            </TooltipContent>
          </Tooltip>
          <Sidebar mobile onNavigate={onNavigate} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
