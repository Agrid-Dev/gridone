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
import type { Device, DevicesFilter } from "@/api/devices";
import {
  intersectWritableAttributes,
  isEmptyFilter,
  resolveFilter,
  type WizardFormValues,
  type WritableAttribute,
} from "./types";

export type DispatchResult =
  | { kind: "single" }
  | { kind: "batch"; batchId: string };

export type UseCommandWizardArgs = {
  devices: Device[];
  /** Pre-defined target for the wizard. When set, the target step is skipped
   *  (initial step is the command step) and the filter is treated as the
   *  authoritative target. Callers build this from URL params — e.g. the
   *  device-scoped entry point passes ``{ids: [deviceId]}``, the asset-scoped
   *  entry point passes ``{assetId}``. When omitted, the user picks a target
   *  through the wizard's first step. */
  predefinedTarget?: DevicesFilter;
  /** Callback after a successful dispatch. The caller owns navigation. */
  onDispatched: (result: DispatchResult) => void;
  /** Callback after a successful save-as-template. */
  onSaved: (template: CommandTemplate) => void;
};

const DRAFT_KEY = "commands.wizard.draft";
const DRAFT_DEBOUNCE_MS = 250;

export function useCommandWizard({
  devices,
  predefinedTarget,
  onDispatched,
  onSaved,
}: UseCommandWizardArgs) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const isPredefined = !!predefinedTarget && !isEmptyFilter(predefinedTarget);
  const initialStep = isPredefined ? 1 : 0;

  const { control, watch, setValue, getValues, trigger, reset } =
    useForm<WizardFormValues>({
      mode: "onChange",
      defaultValues: {
        targetMode: "devices",
        deviceIds: [],
        targetFilter: {},
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
    // When the target is predefined, step 0 isn't reachable.
    const min = isPredefined ? 1 : 0;
    const clamped = Math.max(min, Math.min(2, idx));
    const next = new URLSearchParams(searchParams);
    next.set("step", String(clamped + 1));
    setSearchParams(next);
  };

  // -- Local-storage draft --------------------------------------------------
  // Drafts only make sense for the open-context wizard — a predefined target
  // is driven by the URL, not by the user's previous selection.
  useEffect(() => {
    if (isPredefined) return;
    const draft = loadDraft();
    if (draft) reset(draft);
  }, []);

  useEffect(() => {
    if (isPredefined) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = watch((draftValues) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveDraft(draftValues as WizardFormValues);
      }, DRAFT_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [watch, isPredefined]);

  // -- Derived state --------------------------------------------------------
  const values = watch();

  const selectedDevices = useMemo(() => {
    if (isPredefined) {
      return resolveFilter(devices, predefinedTarget!);
    }
    if (values.targetMode === "filters") {
      return resolveFilter(devices, values.targetFilter ?? {});
    }
    const ids = values.deviceIds ?? [];
    return devices.filter((d) => ids.includes(d.id));
  }, [
    isPredefined,
    predefinedTarget,
    devices,
    values.targetMode,
    values.deviceIds,
    values.targetFilter,
  ]);

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
  const effectiveTarget = useMemo(
    () => buildTarget(values, selectedDevices, predefinedTarget),
    [values, selectedDevices, predefinedTarget],
  );

  const dispatchMutation = useMutation<DispatchResult, Error, WizardFormValues>(
    {
      mutationFn: (v) => dispatch(v, selectedDevices, effectiveTarget),
      onSuccess: (result) => {
        clearDraft();
        queryClient.invalidateQueries({ queryKey: ["commands"] });
        onDispatched(result);
      },
    },
  );

  const saveMutation = useMutation<CommandTemplate, Error, WizardFormValues>({
    mutationFn: (v) => saveTemplate(v, effectiveTarget),
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
    isPredefined,
    isFirstStep: step === initialStep,
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

/** Build the DevicesFilter to send as the ``target`` on dispatch/save. When
 *  a predefined target is provided, it wins — the form's target fields are
 *  inert in that case. Otherwise the result reflects the user's choice of
 *  target mode. */
function buildTarget(
  values: WizardFormValues,
  selectedDevices: Device[],
  predefinedTarget: DevicesFilter | undefined,
): DevicesFilter {
  if (predefinedTarget && !isEmptyFilter(predefinedTarget)) {
    return predefinedTarget;
  }
  if (values.targetMode === "filters") {
    return {
      assetId: values.targetFilter?.assetId,
      types: values.targetFilter?.types,
    };
  }
  return { ids: selectedDevices.map((d) => d.id) };
}

async function dispatch(
  v: WizardFormValues,
  selectedDevices: Device[],
  target: DevicesFilter,
): Promise<DispatchResult> {
  if (!v.attribute || v.value === undefined) {
    throw new Error("Form incomplete");
  }
  if (selectedDevices.length === 0) {
    throw new Error("No devices selected");
  }
  const attribute = v.attribute;
  const value = v.value as AttributeValue;

  // Single-device fast path: one explicit id in the target and no other
  // filter. Everything else goes through the batch endpoint so the server
  // resolves at dispatch time (important for asset-based targets).
  if (
    target.ids &&
    target.ids.length === 1 &&
    !target.types &&
    !target.assetId
  ) {
    await dispatchSingleCommand(target.ids[0], { attribute, value });
    return { kind: "single" };
  }

  const res = await dispatchBatchCommand({ attribute, value, target });
  return { kind: "batch", batchId: res.batchId };
}

async function saveTemplate(
  v: WizardFormValues,
  target: DevicesFilter,
): Promise<CommandTemplate> {
  if (!v.attribute || v.value === undefined || !v.attributeDataType) {
    throw new Error("Form incomplete");
  }
  const name = (v.templateName ?? "").trim();
  if (!name) {
    throw new Error("Template name required");
  }
  return createTemplate({
    target,
    write: {
      attribute: v.attribute,
      value: v.value as AttributeValue,
      dataType: v.attributeDataType,
    },
    name,
  });
}

// -- Draft persistence ------------------------------------------------------

function loadDraft(): WizardFormValues | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as WizardFormValues) : null;
  } catch {
    return null;
  }
}

function saveDraft(values: WizardFormValues): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
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
