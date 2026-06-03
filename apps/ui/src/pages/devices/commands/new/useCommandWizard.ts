import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import type { AttributeValue, AttributeWrite } from "@/api/commands";
import type { Device, DevicesFilter } from "@/api/devices";
import {
  intersectWritableAttributes,
  isEmptyFilter,
  resolveFilter,
} from "./resolvers";
import type { WizardFormValues, WritableAttribute } from "./types";
import { useCommandTemplate } from "./useCommandTemplate";

type CommandPayload = {
  target: DevicesFilter;
  write: AttributeWrite;
};

export type UseCommandWizardArgs = {
  devices: Device[];
  /** Pre-defined target for the wizard. When set, the target step is skipped
   *  (initial step is the command step) and the filter is treated as the
   *  authoritative target. Callers build this from URL params — e.g. the
   *  device-scoped entry point passes ``{ids: [deviceId]}``, the asset-scoped
   *  entry point passes ``{assetId}``. When omitted, the user picks a target
   *  through the wizard's first step. */
  predefinedTarget?: DevicesFilter;
  /** Existing template being edited. ``id: undefined`` (or undefined as a
   *  whole) means create-fresh — the first save/dispatch POSTs; subsequent
   *  ones PATCH the resolved row. */
  template?: { id?: string; name?: string | null };
  /** Seed the form's initial values (target, write, name) when editing an
   *  existing template inline. The wizard skips draft loading when defaults
   *  are provided, so the inline editor doesn't pick up a leftover from the
   *  standalone wizard. */
  defaultValues?: Partial<WizardFormValues>;
  /** Disable the local-storage draft entirely. Set by inline use sites
   *  (action form's "+ Create new") that don't share the standalone
   *  wizard's draft buffer. */
  disableDraft?: boolean;
};

const DRAFT_KEY = "commands.wizard.draft";
const DRAFT_DEBOUNCE_MS = 250;

export function useCommandWizard({
  devices,
  predefinedTarget,
  template,
  defaultValues,
  disableDraft,
}: UseCommandWizardArgs) {
  const [searchParams, setSearchParams] = useSearchParams();

  const isPredefined = !!predefinedTarget && !isEmptyFilter(predefinedTarget);
  const initialStep = isPredefined ? 1 : 0;
  const draftsDisabled = disableDraft || !!defaultValues;

  const { control, watch, setValue, getValues, trigger, reset } =
    useForm<WizardFormValues>({
      mode: "onChange",
      defaultValues: {
        targetMode: "devices",
        deviceIds: [],
        targetFilter: {},
        ...defaultValues,
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
  // is driven by the URL, and the inline editor seeds from the existing
  // template, neither of which want the standalone wizard's draft.
  useEffect(() => {
    if (isPredefined || draftsDisabled) return;
    const draft = loadDraft();
    if (draft) reset(draft);
  }, []);

  useEffect(() => {
    if (isPredefined || draftsDisabled) return;
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
  }, [watch, isPredefined, draftsDisabled]);

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

  // -- Step navigation ------------------------------------------------------
  const handleNext = async () => {
    const ok = await trigger();
    if (!ok) return;
    if (step === 0 && !targetValid) return;
    if (step === 1 && !commandValid) return;
    setStep(step + 1);
  };

  const handleBack = () => setStep(step - 1);

  // -- Commit lifecycle -----------------------------------------------------
  const effectiveTarget = useMemo(
    () => buildTarget(values, selectedDevices, predefinedTarget),
    [values, selectedDevices, predefinedTarget],
  );

  const templateMutation = useCommandTemplate({ initialId: template?.id });

  const templateName = (values.templateName ?? "").trim();
  const formCommittable = commandValid && selectedDevices.length > 0;
  const canSave =
    formCommittable &&
    templateName.length > 0 &&
    !templateMutation.isCommitting;
  const canDispatch = formCommittable && !templateMutation.isCommitting;

  const getCommandPayload = (): CommandPayload | null => {
    const v = getValues();
    if (!v.attribute || v.value === undefined || !v.attributeDataType) {
      return null;
    }
    if (selectedDevices.length === 0) return null;
    return {
      target: effectiveTarget,
      write: {
        attribute: v.attribute,
        value: v.value as AttributeValue,
        dataType: v.attributeDataType,
      },
    };
  };

  /** Validate, snapshot the form, POST-or-PATCH the template, clear the
   *  draft, return the resolved templateId. ``null`` when validation
   *  fails or commit errors out — the error is exposed via
   *  ``commitError`` so the caller can render a toast off it. */
  const commit = async (name: string | null): Promise<string | null> => {
    const ok = await trigger();
    if (!ok) return null;
    const payload = getCommandPayload();
    if (!payload) return null;
    try {
      const result = await templateMutation.commit({ ...payload, name });
      clearDraft();
      return result.id;
    } catch {
      // Mutation error is already in flight via ``templateMutation.error`` —
      // the caller picks it up off ``commitError``. Returning null lets a
      // simple ``if (id) onSubmit(id)`` work without a try/catch at the
      // call site.
      return null;
    }
  };

  return {
    // form state
    control,
    setValue,
    values,
    // derived
    step,
    selectedDevices,
    compatibleAttributes,
    targetValid,
    commandValid,
    isPredefined,
    isFirstStep: step === initialStep,
    canSave,
    canDispatch,
    // commit lifecycle
    isCommitting: templateMutation.isCommitting,
    commitError: templateMutation.error,
    resolvedTemplateId: templateMutation.resolvedId,
    // methods
    handleNext,
    handleBack,
    /** Save with the user-entered template name. */
    save: () => commit(templateName),
    /** Dispatch path. If the user typed a name in the review step, the
     *  template is saved under that name (and then dispatched) — no point
     *  orphaning a perfectly good name. Otherwise the commit is ephemeral
     *  (``name: null``). The inline-action use case ("Use this command")
     *  will pass through this same slot in Step 4 with no name input
     *  rendered, so it always commits ephemeral. */
    dispatch: () => {
      const liveName = (getValues().templateName ?? "").trim();
      return commit(liveName.length > 0 ? liveName : null);
    },
    /** Discard the local-storage draft. The wizard calls this on cancel
     *  and on successful commit; explicit so callers can reset on
     *  navigation if they need to. */
    clearDraft,
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
