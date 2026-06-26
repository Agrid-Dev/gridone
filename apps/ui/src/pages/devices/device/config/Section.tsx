import { type ReactNode } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/** One settings section on the device config page. No card, no background — a
 *  hairline-ruled eyebrow header over flat rows. The read/edit swap happens
 *  inside `children`, so the section frame never moves. */
export function Section({
  title,
  action,
  busy,
  children,
}: {
  title: string;
  action?: ReactNode;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-busy={busy} className="group/section">
      <header className="flex min-h-7 items-center justify-between gap-4 border-b border-border/50 pb-2">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h2>
        {action}
      </header>
      <div className={cn("pt-1", busy && "pointer-events-none")}>
        {children}
      </div>
    </section>
  );
}

/** A label / value row. The label column is fixed so the value sits in the
 *  same place whether it is read-only text or an inline editor. */
export function SectionRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] items-baseline gap-x-6 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 break-words text-sm text-foreground">
        {children}
      </div>
    </div>
  );
}

/** The quiet, always-visible "Edit" affordance in a section header. */
export function SectionEditButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <Pencil className="h-3.5 w-3.5" />
      {t("common.edit")}
    </button>
  );
}

/** Right-aligned Save / Cancel for a section in edit mode. */
export function SectionActions({
  saveDisabled,
  submitting,
  onCancel,
}: {
  saveDisabled: boolean;
  submitting?: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="mt-5 flex items-center justify-end gap-4">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {t("common.cancel")}
      </button>
      <Button type="submit" size="sm" disabled={saveDisabled}>
        {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {t("common.save")}
      </Button>
    </div>
  );
}
