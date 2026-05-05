import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import {
  type AttributeValue,
  type CommandTemplateCreatePayload,
} from "@/api/commands";
import type { Device, DevicesFilter } from "@/api/devices";
import {
  intersectWritableAttributes,
  isEmptyFilter,
  resolveFilter,
  type WizardFormValues,
  type WritableAttribute,
} from "./types";

export type UseCommandWizardArgs = {
  devices: Device[];
  /** Pre-defined target for the wizard. When set, the target step is skipped
   *  (initial step is the command step) and the filter is treated as the
   *  authoritative target. Callers build this from URL params — e.g. the
   *  device-scoped entry point passes ``{ids: [deviceId]}``, the asset-scoped
   *  entry point passes ``{assetId}``. When omitted, the user picks a target
   *  through the wizard's first step. */
  predefinedTarget?: DevicesFilter;
  /** When true the review step is skipped. The embedded automation form
   *  has its own global review surface, so it stops the wizard at the
   *  command step. */
  skipReview?: boolean;
};

const DRAFT_KEY = "commands.wizard.draft";
const DRAFT_DEBOUNCE_MS = 250;

/** Form progression for the command wizard — owns the react-hook-form
 *  instance, derived ``selectedDevices`` / ``compatibleAttributes`` /
 *  ``effectiveTarget`` / validation, URL-driven step navigation, and
 *  localStorage drafts. Side-effect-free w.r.t. backend writes: callers wire
 *  their own submit through ``getCommandPayload`` (e.g. the standalone
 *  wizard combines this with ``useCommandMutations``; the inline action
 *  form bubbles the payload up to its parent). */
export function useCommandWizard({
  devices,
  predefinedTarget,
  skipReview = false,
}: UseCommandWizardArgs) {
  const [searchParams, setSearchParams] = useSearchParams();

  const isPredefined = !!predefinedTarget && !isEmptyFilter(predefinedTarget);
  const initialStep = isPredefined ? 1 : 0;
  // Last visitable step index. ``skipReview`` makes the command step the
  // last; otherwise it's the review step.
  const lastStep = skipReview ? 1 : 2;

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
  const step = parseStep(searchParams.get("step"), initialStep, lastStep);

  useEffect(() => {
    if (searchParams.get("step") === null) {
      const next = new URLSearchParams(searchParams);
      next.set("step", String(initialStep + 1));
      setSearchParams(next, { replace: true });
    }
  }, []);

  const setStep = (idx: number) => {
    const min = isPredefined ? 1 : 0;
    const clamped = Math.max(min, Math.min(lastStep, idx));
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

  // If the picked attribute leaves the compatible set after the selection
  // changes, clear it so the command step doesn't show stale state.
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

  const effectiveTarget = useMemo(
    () => buildTarget(values, selectedDevices, predefinedTarget),
    [values, selectedDevices, predefinedTarget],
  );

  /** Build the (target, write) pair. Returns ``null`` while the form is
   *  incomplete. The standalone wizard hands this to ``useCommandMutations``;
   *  the inline action form bubbles it up to the automation submit. */
  const getCommandPayload = (): Omit<
    CommandTemplateCreatePayload,
    "name"
  > | null => {
    const v = getValues();
    if (!v.attribute || v.value === undefined || !v.attributeDataType) {
      return null;
    }
    return {
      target: effectiveTarget,
      write: {
        attribute: v.attribute,
        value: v.value as AttributeValue,
        dataType: v.attributeDataType,
      },
    };
  };

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

  return {
    control,
    setValue,
    values,
    watch,
    getValues,
    reset,
    trigger,
    selectedDevices,
    compatibleAttributes,
    effectiveTarget,
    targetValid,
    commandValid,
    isPredefined,
    skipReview,
    step,
    lastStep,
    isFirstStep: step === initialStep,
    isLastStep: step === lastStep,
    handleNext,
    handleBack,
    handleCancel,
    getCommandPayload,
    /** Used by ``useCommandMutations`` to clear the draft after a successful
     *  dispatch / save. */
    clearDraft,
  };
}

export type CommandWizardState = ReturnType<typeof useCommandWizard>;

function parseStep(
  raw: string | null,
  fallback: number,
  lastStep: number,
): number {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n)) return fallback;
  return Math.max(0, Math.min(lastStep, n - 1));
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

/** Build the ``DevicesFilter`` to send as ``target``. Predefined wins;
 *  otherwise reflects the user's ``targetMode``. */
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
