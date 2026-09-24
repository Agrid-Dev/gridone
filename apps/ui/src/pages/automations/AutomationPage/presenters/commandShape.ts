import type { Action } from "@gridone/sdk";
import type { Scalar } from "@/pages/devices/device/operating-rules/expressions";

/** The inline shape of the `command_template` action: one static write, on a
 *  chosen device or (`device_id: null`) on the triggering event's device. */
export type InlineWrite = {
  device_id: string | null;
  attribute: string;
  value: Scalar;
};

const isScalar = (value: unknown): value is Scalar =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

/** A command action is a saved template or one inline write. The attribute
 *  tells them apart: a template never carries one, an inline write always
 *  does, so a malformed action still reads as a command. */
export function isInlineWrite(action: Action): boolean {
  return (
    action.provider_id === "command_template" &&
    typeof action.params?.attribute === "string"
  );
}

/** The inline write an action carries; null for a template or a malformed one. */
export function inlineWriteOf(action: Action): InlineWrite | null {
  if (!isInlineWrite(action)) return null;
  const params = action.params ?? {};
  if (typeof params.attribute !== "string" || !isScalar(params.value))
    return null;
  return {
    device_id: typeof params.device_id === "string" ? params.device_id : null,
    attribute: params.attribute,
    value: params.value,
  };
}

/** What an action renders as: its icon, tone and type label. */
export type ActionKind = "command" | "write" | "notify";

export function actionKind(action: Action): ActionKind {
  if (action.provider_id === "notification") return "notify";
  return isInlineWrite(action) ? "write" : "command";
}

/** i18n key of the type label: a template, an inline write and a notification
 *  read differently although the first two share a provider. */
export function actionTypeKey(action: Action): string {
  return isInlineWrite(action)
    ? "actions.types.inline_write"
    : `actions.types.${action.provider_id}`;
}
