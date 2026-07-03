import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { fmt } from "./format";
import { useAhuSynopticLabel, type AhuSynopticLabelKey } from "./labels";
import { SetpointDialog } from "./SetpointDialog";

export type AhuSetpointSpec<K extends string> = {
  key: K;
  digits: number;
  suffix?: string;
};

type AhuSetpointsSectionProps<K extends AhuSynopticLabelKey> = {
  setpoints: readonly AhuSetpointSpec<K>[];
  values: Partial<Record<K, number | null>>;
  /** Setpoints the current device accepts writes for; the others render
   *  read-only. */
  writableSetpoints?: readonly K[];
  onSetpointSave?: (key: K, value: number) => void | Promise<void>;
};

/** Setpoint chips below an AHU synoptic: writable ones open the edit
 *  dialog, the others render read-only. A missing, non-writable setpoint
 *  is omitted entirely. */
export function AhuSetpointsSection<K extends AhuSynopticLabelKey>({
  setpoints,
  values,
  writableSetpoints = [],
  onSetpointSave,
}: AhuSetpointsSectionProps<K>) {
  const { t: tCommon } = useTranslation("common");
  const label = useAhuSynopticLabel();
  const [editing, setEditing] = useState<K | null>(null);

  return (
    <div className="mt-4 border-t pt-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label("setpoints")}
      </p>
      <div className="flex flex-wrap gap-2">
        {setpoints.map(({ key, digits, suffix }) => {
          const value = values[key];
          const writable = writableSetpoints.includes(key);
          if (value == null && !writable) return null;
          const content = (
            <>
              <span className="text-muted-foreground">{label(key)}</span>
              <span className="font-semibold text-foreground">
                {fmt(value, digits, suffix)}
              </span>
            </>
          );
          return writable ? (
            <button
              key={key}
              type="button"
              onClick={() => setEditing(key)}
              aria-label={`${tCommon("common.edit")} ${label(key)}`}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary hover:bg-accent"
            >
              {content}
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ) : (
            <div
              key={key}
              title={tCommon("common.readOnly")}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm"
            >
              {content}
            </div>
          );
        })}
      </div>

      {editing && (
        <SetpointDialog
          label={label(editing)}
          currentValue={values[editing] ?? null}
          onClose={() => setEditing(null)}
          onSave={async (value) => {
            await onSetpointSave?.(editing, value);
          }}
        />
      )}
    </div>
  );
}
