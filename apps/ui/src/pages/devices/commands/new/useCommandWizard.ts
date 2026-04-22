import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTemplate,
  dispatchBatchCommand,
  dispatchSingleCommand,
  type AttributeValue,
  type CommandTemplate,
} from "@/api/commands";
import type { AssetTreeNode } from "@/api/assets";
import type { Device, DevicesFilter } from "@/api/devices";
import {
  intersectWritableAttributes,
  resolveAssetSubtreeDeviceIds,
  resolveTargetFilter,
  type TargetMode,
  type WizardContext,
  type WizardFormValues,
  type WritableAttribute,
} from "./types";

export type DispatchResult =
  | { kind: "single" }
  | { kind: "batch"; batchId: string };

export type UseCommandWizardArgs = {
  context: WizardContext;
  devices: Device[];
  assetTree: AssetTreeNode[];
  lockedDeviceId?: string;
  lockedAssetId?: string;
  /** Callback after a successful dispatch. The caller owns navigation. */
  onDispatched: (result: DispatchResult) => void;
  /** Callback after a successful save-as-template. */
  onSaved: (template: CommandTemplate) => void;
};

const DRAFT_KEY = "commands.wizard.draft";
const DRAFT_DEBOUNCE_MS = 250;

export function useCommandWizard({
  context,
  devices,
  assetTree,
  lockedDeviceId,
  lockedAssetId,
  onDispatched,
  onSaved,
}: UseCommandWizardArgs) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Where the wizard opens the first time it renders. Users can always navigate
  // all the way back to step 0 from there via Back.
  const initialStep = context === "device" ? 1 : 0;

  // A device-locked wizard can't meaningfully use the filter-mode target:
  // there is exactly one target and it's fixed. Force it to the devices mode.
  const lockMode: TargetMode | undefined =
    context === "device" ? "devices" : undefined;

  const initialDeviceIds = useMemo(() => {
    if (lockedDeviceId) return [lockedDeviceId];
    if (lockedAssetId)
      return resolveAssetSubtreeDeviceIds(assetTree, lockedAssetId);
    return [];
  }, [lockedDeviceId, lockedAssetId, assetTree]);

  const { control, watch, setValue, getValues, trigger, reset } =
    useForm<WizardFormValues>({
      mode: "onChange",
      defaultValues: {
        targetMode: lockMode ?? "devices",
        deviceIds: initialDeviceIds,
        targetFilter: lockedAssetId ? { assetId: lockedAssetId } : {},
      },
    });

  // -- URL-driven step ------------------------------------------------------
  const step = parseStep(searchParams.get("step"), initialStep);

  useEffect(() => {
    if (searchParams.get("step") === null) {
      const next = new URLSearchParams(searchParams);
      next.set("step", String(initialStep + 1));
      setSearchParams(next, { replace: true });
    }
  }, []);

  const setStep = (idx: number) => {
    const clamped = Math.max(0, Math.min(2, idx));
    const next = new URLSearchParams(searchParams);
    next.set("step", String(clamped + 1));
    setSearchParams(next);
  };

  // -- Local-storage draft --------------------------------------------------
  useEffect(() => {
    const draft = loadDraft();
    if (
      draft &&
      matchesContext(draft, context, lockedDeviceId, lockedAssetId)
    ) {
      reset(draft.values);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = watch((draftValues) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveDraft({
          context,
          lockedDeviceId,
          lockedAssetId,
          values: draftValues as WizardFormValues,
        });
      }, DRAFT_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [watch, context, lockedDeviceId, lockedAssetId]);

  // -- Derived state --------------------------------------------------------
  const values = watch();

  const selectedDevices = useMemo(() => {
    if (values.targetMode === "filters") {
      return resolveTargetFilter(devices, values.targetFilter ?? {});
    }
    const ids = values.deviceIds ?? [];
    return devices.filter((d) => ids.includes(d.id));
  }, [devices, values.targetMode, values.deviceIds, values.targetFilter]);

  const compatibleAttributes = useMemo(
    () => intersectWritableAttributes(selectedDevices),
    [selectedDevices],
  );

  // If the selected attribute is no longer compatible after the selection
  // changes, clear it so step 2 doesn't display stale state.
  useEffect(() => {
    if (
      values.attribute &&
      !compatibleAttributes.some((a) => a.name === values.attribute)
    ) {
      setValue("attribute", undefined);
      setValue("attributeDataType", undefined);
      setValue("value", undefined);
    }
  }, [compatibleAttributes, values.attribute, setValue]);

  const targetValid = isTargetValid(selectedDevices, compatibleAttributes);
  const commandValid = isCommandValid(
    values,
    compatibleAttributes,
    selectedDevices.length,
  );

  // -- Mutations ------------------------------------------------------------
  const dispatchMutation = useMutation<DispatchResult, Error, WizardFormValues>(
    {
      mutationFn: (v) => dispatch(v, selectedDevices),
      onSuccess: (result) => {
        clearDraft();
        queryClient.invalidateQueries({ queryKey: ["commands"] });
        onDispatched(result);
      },
    },
  );

  const saveMutation = useMutation<CommandTemplate, Error, WizardFormValues>({
    mutationFn: (v) => saveTemplate(v, selectedDevices),
    onSuccess: (template) => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["command-templates"] });
      onSaved(template);
    },
  });

  const handleNext = async () => {
    const ok = await trigger();
    if (!ok) return;
    if (step === 0 && !targetValid) return;
    if (step === 1 && !commandValid) return;
    setStep(step + 1);
  };

  const handleBack = () => setStep(step - 1);

  const handleCancel = () => {
    clearDraft();
  };

  const handleDispatch = () => dispatchMutation.mutate(getValues());
  const handleSave = () => saveMutation.mutate(getValues());

  return {
    control,
    setValue,
    values,
    step,
    selectedDevices,
    compatibleAttributes,
    targetValid,
    commandValid,
    lockMode,
    isDispatching: dispatchMutation.isPending,
    isSaving: saveMutation.isPending,
    dispatchError: dispatchMutation.error,
    saveError: saveMutation.error,
    handleNext,
    handleBack,
    handleCancel,
    handleDispatch,
    handleSave,
  };
}

function parseStep(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n)) return fallback;
  return Math.max(0, Math.min(2, n - 1));
}

function isTargetValid(
  selectedDevices: Device[],
  compatibleAttrs: WritableAttribute[],
): boolean {
  return selectedDevices.length > 0 && compatibleAttrs.length > 0;
}

function isCommandValid(
  v: WizardFormValues,
  compatibleAttrs: WritableAttribute[],
  selectedCount: number,
): boolean {
  if (selectedCount === 0) return false;
  if (!v.attribute) return false;
  if (!compatibleAttrs.some((a) => a.name === v.attribute)) return false;
  return v.value !== undefined && v.value !== "";
}

function buildTarget(
  v: WizardFormValues,
  selectedDevices: Device[],
): DevicesFilter {
  if (v.targetMode === "filters") {
    return {
      assetId: v.targetFilter?.assetId,
      types: v.targetFilter?.types,
    };
  }
  return { ids: selectedDevices.map((d) => d.id) };
}

async function dispatch(
  v: WizardFormValues,
  selectedDevices: Device[],
): Promise<DispatchResult> {
  if (!v.attribute || v.value === undefined) {
    throw new Error("Form incomplete");
  }
  if (selectedDevices.length === 0) {
    throw new Error("No devices selected");
  }
  const attribute = v.attribute;
  const value = v.value as AttributeValue;

  // Single-device fast path only applies to the devices mode with exactly one
  // selection. Filter-mode dispatches always go through the batch endpoint so
  // the server resolves at dispatch time.
  if (v.targetMode === "devices" && selectedDevices.length === 1) {
    await dispatchSingleCommand(selectedDevices[0].id, { attribute, value });
    return { kind: "single" };
  }

  const res = await dispatchBatchCommand({
    attribute,
    value,
    target: buildTarget(v, selectedDevices),
  });
  return { kind: "batch", batchId: res.batchId };
}

async function saveTemplate(
  v: WizardFormValues,
  selectedDevices: Device[],
): Promise<CommandTemplate> {
  if (!v.attribute || v.value === undefined || !v.attributeDataType) {
    throw new Error("Form incomplete");
  }
  const name = (v.templateName ?? "").trim();
  if (!name) {
    throw new Error("Template name required");
  }
  return createTemplate({
    target: buildTarget(v, selectedDevices),
    write: {
      attribute: v.attribute,
      value: v.value as AttributeValue,
      dataType: v.attributeDataType,
    },
    name,
  });
}

// -- Draft persistence ------------------------------------------------------

type StoredDraft = {
  context: WizardContext;
  lockedDeviceId?: string;
  lockedAssetId?: string;
  values: WizardFormValues;
};

function loadDraft(): StoredDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: StoredDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota / disabled storage */
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function matchesContext(
  draft: StoredDraft,
  context: WizardContext,
  lockedDeviceId: string | undefined,
  lockedAssetId: string | undefined,
): boolean {
  return (
    draft.context === context &&
    draft.lockedDeviceId === lockedDeviceId &&
    draft.lockedAssetId === lockedAssetId
  );
}
