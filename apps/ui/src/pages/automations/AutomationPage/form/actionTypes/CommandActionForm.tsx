import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Terminal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import CommandTemplatePicker from "@/components/forms/resourcePickers/CommandTemplatePicker";
import type { CommandTemplateResponse } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import type { DevicesFilter } from "@/lib/devices";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useDevicesList } from "@/hooks/useDevicesList";
import { CommandWizard } from "@/pages/devices/commands/new/CommandWizard";
import { useCommandWizard } from "@/pages/devices/commands/new/useCommandWizard";
import type { WizardFormValues } from "@/pages/devices/commands/new/types";
import { TitlePresenter } from "../../presenters/BasePresenter";
import type { CustomActionFormProps } from "../../presenters/types";

type Mode = "pick" | "compose";

function readInitialTemplateId(
  initialValue: CustomActionFormProps["initialValue"],
): string | undefined {
  if (initialValue?.provider_id !== "command_template") return undefined;
  const id = initialValue.params?.template_id;
  return typeof id === "string" ? id : undefined;
}

/** Map a saved template back into the wizard's form-state shape so
 *  ``InlineWizard`` can pre-populate when editing. ``targetMode`` mirrors
 *  the original target's flavour: a bare id list opens the picker in
 *  "devices" mode; anything else (asset_id / types) opens in "filters". */
function templateToFormValues(
  template: CommandTemplateResponse,
): Partial<WizardFormValues> {
  const target = template.target as DevicesFilter;
  const usingIdsOnly =
    !!target.ids?.length && !target.asset_id && !target.types?.length;
  return {
    targetMode: usingIdsOnly ? "devices" : "filters",
    deviceIds: target.ids ?? [],
    targetFilter: {
      assetId: target.asset_id ?? undefined,
      types: target.types ?? undefined,
    },
    attribute: template.write.attribute,
    attributeDataType: template.write.data_type,
    value: template.write.value,
    templateName: template.name ?? "",
  };
}

type InlineWizardProps = {
  template?: CommandTemplateResponse;
  onCancel: () => void;
  onCommitted: (templateId: string) => void;
};

/** The wizard mounted as the inline action body. ``template`` (when set)
 *  seeds the form so editing PATCHes the same row; ``undefined`` means
 *  ``compose new`` and the first commit POSTs an ephemeral. */
const InlineWizard: FC<InlineWizardProps> = ({
  template,
  onCancel,
  onCommitted,
}) => {
  const { t } = useTranslation(["automations", "common"]);
  const { devices } = useDevicesList();
  const { assetTree, assetsList, assetsById } = useAssetTree();

  const wizard = useCommandWizard({
    devices,
    template: template
      ? { id: template.id, name: template.name }
      : { id: undefined, name: null },
    defaultValues: template ? templateToFormValues(template) : undefined,
    disableDraft: true,
  });

  return (
    <CommandWizard
      wizard={wizard}
      devices={devices}
      assetTree={assetTree}
      assetsList={assetsList}
      assetsById={assetsById}
      onCancel={onCancel}
      dispatchSubmit={{
        label: t("automations:actions.commandActionForm.useCommand"),
        onSubmit: onCommitted,
      }}
    />
  );
};

/** Unified body for the ``command_template`` action type. The user picks
 *  between two sources at the top of the form: ``Use a saved template``
 *  shows the picker; ``Define a new command`` swaps in ``<CommandWizard>``
 *  inline so the user can author one without leaving the automation page.
 *  An automation that already references an *ephemeral* template auto-
 *  opens compose mode pre-populated, since the picker filters ephemerals
 *  out and the wizard is the only place to edit them. */
export const CommandActionForm: FC<CustomActionFormProps> = ({
  initialValue,
  onChange,
}) => {
  const { t } = useTranslation("automations");
  const client = useGridoneClient();
  const initialId = readInitialTemplateId(initialValue);

  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | undefined
  >(initialId);
  const [mode, setMode] = useState<Mode | null>(null);
  // The template the wizard is editing inline (PATCH semantics) — only
  // set when the action references an *ephemeral* template, since that's
  // the one place the wizard has to seed from existing values. Explicit
  // mode switch via the Source select clears this so ``Define a new
  // command`` always starts from a clean slate.
  const [composeFromTemplate, setComposeFromTemplate] = useState<
    CommandTemplateResponse | undefined
  >(undefined);

  const { data: selectedTemplate } = useQuery({
    queryKey: ["command-templates", selectedTemplateId],
    queryFn: () => client.devices.commandTemplates.get(selectedTemplateId!),
    enabled: !!selectedTemplateId,
  });

  // Mode inference is one-shot — runs after the initial template (if any)
  // resolves, then never again. After that, mode changes only via explicit
  // user action (the Source select) so we don't trap the user.
  useEffect(() => {
    if (mode !== null) return;
    if (!initialId) {
      setMode("pick");
      return;
    }
    if (selectedTemplate) {
      if (selectedTemplate.name === null) {
        setMode("compose");
        setComposeFromTemplate(selectedTemplate);
      } else {
        setMode("pick");
      }
    }
  }, [initialId, selectedTemplate, mode]);

  const switchToPick = () => {
    setMode("pick");
    setComposeFromTemplate(undefined);
    setSelectedTemplateId(undefined);
    onChange(null);
  };

  const switchToCompose = () => {
    setMode("compose");
    setComposeFromTemplate(undefined);
    onChange(null);
  };

  if (initialId && mode === null) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <div className="space-y-4">
      <FieldShell
        id="command-source"
        label={t("actions.commandActionForm.sourceLabel")}
      >
        <Select
          value={mode ?? "pick"}
          onValueChange={(v) => {
            if (v === "pick") switchToPick();
            else switchToCompose();
          }}
        >
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pick">
              <TitlePresenter
                icon={Terminal}
                title={t("actions.commandActionForm.useTemplate")}
              />
            </SelectItem>
            <SelectItem value="compose">
              <TitlePresenter
                icon={Terminal}
                title={t("actions.commandActionForm.composeNew")}
              />
            </SelectItem>
          </SelectContent>
        </Select>
      </FieldShell>

      {mode === "pick" ? (
        <CommandTemplatePicker
          value={selectedTemplateId}
          onSelect={(template) => {
            setSelectedTemplateId(template.id);
            onChange({
              provider_id: "command_template",
              params: { template_id: template.id },
            });
          }}
        />
      ) : (
        <InlineWizard
          template={composeFromTemplate}
          onCancel={switchToPick}
          onCommitted={(templateId) => {
            setSelectedTemplateId(templateId);
            onChange({
              provider_id: "command_template",
              params: { template_id: templateId },
            });
          }}
        />
      )}
    </div>
  );
};
