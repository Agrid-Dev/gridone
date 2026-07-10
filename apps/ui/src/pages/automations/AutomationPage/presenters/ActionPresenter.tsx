import { useTranslation } from "react-i18next";
import type { Action } from "@gridone/sdk";
import { getActionDescriptor } from "./actionRegistry";
import BasePresenter from "./BasePresenter";

/** View-mode dispatcher for an automation's action. Mirrors
 *  ``TriggerPresenter``: looks up the descriptor for the action's provider
 *  and renders its Presenter inside the shared bordered shell. */
export function ActionPresenter({ action }: { action: Action }) {
  const { t } = useTranslation("automations");
  const descriptor = getActionDescriptor(action.provider_id);

  return (
    <BasePresenter
      title={t(`actions.types.${action.provider_id}`, {
        defaultValue: action.provider_id,
      })}
      icon={descriptor.icon}
    >
      <descriptor.Presenter action={action} />
    </BasePresenter>
  );
}
