import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * The top of the panel: what is selected, by the name the editor gives it,
 * what kind of thing it is, and what can be done to it. A symbol's name is
 * its label, typed in place; the name the editor would give it otherwise
 * stands as the placeholder, so an unnamed pump still reads "Pompe 2".
 */
export function InspectorHeader({
  icon,
  name,
  label,
  onLabel,
  onLabelDone,
  subtitle,
  actions,
}: {
  icon: ReactNode;
  /** What the editor calls the element. */
  name: string;
  /** The label the author wrote, editable; omitted for what has none. */
  label?: string;
  onLabel?: (text: string) => void;
  onLabelDone?: () => void;
  subtitle: string;
  actions?: ReactNode;
}) {
  const { t } = useTranslation("synoptics");
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-synoptic-plate">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {onLabel ? (
          <input
            aria-label={t("editor.label")}
            value={label ?? ""}
            placeholder={name}
            onChange={(e) => onLabel(e.target.value)}
            onBlur={onLabelDone}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="-ml-1.5 h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 font-display text-base font-semibold outline-none placeholder:text-foreground/60 hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        ) : (
          <h2 className="truncate font-display text-base font-semibold leading-8">
            {name}
          </h2>
        )}
        <span className="truncate text-sm text-muted-foreground">
          {subtitle}
        </span>
      </div>
      {actions && <div className="flex shrink-0 gap-0.5">{actions}</div>}
    </div>
  );
}

/** A titled part of the panel. */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
