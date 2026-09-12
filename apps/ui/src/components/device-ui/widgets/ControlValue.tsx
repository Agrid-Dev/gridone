import { useTranslation } from "react-i18next";
import type { BoundControlState, DeviceUiRuntime } from "../runtime";

/** Groups can choose an absolute target without replacing the driver's widget. */
export function ControlValue({
  id,
  state,
  runtime,
  label,
  text,
}: {
  id: string;
  state: BoundControlState;
  runtime: DeviceUiRuntime;
  label: string;
  text: string;
}) {
  const { t } = useTranslation("devices");
  return runtime.chooseValue ? (
    <button
      type="button"
      className="rounded-sm underline decoration-dotted underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={`${t("groups.chooseTarget")}: ${label}`}
      disabled={!state.writable}
      onClick={() => runtime.chooseValue?.(id)}
    >
      {text}
    </button>
  ) : (
    <span>{text}</span>
  );
}
