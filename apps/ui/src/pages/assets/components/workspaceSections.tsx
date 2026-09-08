import type { ReactNode } from "react";

/** Heading shared by the asset-workspace cards. */
export function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

/** Dashed empty placeholder shared by the asset-workspace cards. */
export function EmptySection({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
