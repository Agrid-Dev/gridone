import { useAhuSynopticLabel } from "./labels";
import { SetpointDialog } from "./SetpointDialog";
import type { AhuReadings, AhuSetpointKey } from "./streams";

type AhuSetpointEditorProps<K extends AhuSetpointKey> = {
  /** The setpoint being edited; nothing renders while null. */
  editing: K | null;
  values: AhuReadings;
  onClose: () => void;
  onSave?: (key: K, value: number) => void | Promise<void>;
};

/** The setpoint dialog of an AHU synoptic, keyed on the setpoint so each
 *  opening starts from that setpoint's current value. */
export function AhuSetpointEditor<K extends AhuSetpointKey>({
  editing,
  values,
  onClose,
  onSave,
}: AhuSetpointEditorProps<K>) {
  const label = useAhuSynopticLabel();
  if (!editing) return null;
  return (
    <SetpointDialog
      key={editing}
      label={label(editing)}
      currentValue={values[editing] ?? null}
      onClose={onClose}
      onSave={async (value) => {
        await onSave?.(editing, value);
      }}
    />
  );
}
