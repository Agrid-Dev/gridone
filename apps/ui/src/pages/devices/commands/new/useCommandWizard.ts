import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import type {
  AttributeCoverage,
  AttributeWritePayload,
  Device,
} from "@gridone/sdk";
import type { AttributeValue, DevicesFilter } from "@/lib/devices";
import { useAttributeCoverage } from "@/components/forms/targetPicker";
import {
  currentValueFor,
  isEmptyFilter,
  resolveFilter,
  targetFilterToDevicesFilter,
} from "./resolvers";
import type { WizardFormValues } from "./types";
import { useCommandTemplate } from "./useCommandTemplate";

type CommandPayload = {
  target: DevicesFilter;
  write: AttributeWritePayload;
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
  /** Attribute name to pre-select once it's known writable on the target —
   *  the deep-link from the device Overview. Applied once; the user still
   *  supplies the value. */
  preselectAttribute?: string;
};

const DRAFT_KEY = "commands.wizard.draft";
const DRAFT_DEBOUNCE_MS = 250;

export function useCommandWizard({
  devices,
  predefinedTarget,
  template,
  defaultValues,
  disableDraft,
  preselectAttribute,
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
      return resolveFilter(
        devices,
        targetFilterToDevicesFilter(values.targetFilter),
      );
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

  // The effective device-set filter the attribute coverage is computed over.
  // Union-with-coverage semantics: devices matching the filter but not
  // exposing the dispatched attribute as writable are excluded server-side.
  const coverageFilter = useMemo<DevicesFilter>(() => {
    if (isPredefined) return predefinedTarget!;
    if (values.targetMode === "filters") {
      return targetFilterToDevicesFilter(values.targetFilter);
    }
    return { ids: values.deviceIds ?? [] };
  }, [
    isPredefined,
    predefinedTarget,
    values.targetMode,
    values.deviceIds,
    values.targetFilter,
  ]);

  const {
    coverage,
    isLoading: coverageLoading,
    error: coverageError,
  } = useAttributeCoverage(coverageFilter, {
    enabled: !isEmptyFilter(coverageFilter),
  });
  const writableCoverage = useMemo(
    () => coverage.filter((c) => c.writable_count > 0),
    [coverage],
  );

  // If the selected attribute is no longer targetable after the selection
  // changes (out of coverage, not writable, or mixed data types), clear it
  // so step 2 doesn't display stale state. Only act on settled coverage —
  // a fetch in flight (or a failed one) must not wipe the user's choice.
  useEffect(() => {
    if (coverageLoading || coverageError || !values.attribute) return;
    const row = writableCoverage.find((c) => c.attribute === values.attribute);
    if (!row || row.data_types.length !== 1) {
      setValue("attribute", undefined);
      setValue("attributeDataType", undefined);
      setValue("value", undefined);
    }
  }, [
    coverageLoading,
    coverageError,
    writableCoverage,
    values.attribute,
    setValue,
  ]);

  // Deep-link pre-selection: apply once the target's writable attributes are
  // known (they load async), and only if the requested attribute is among
  // them. Pre-fill the value with the device's current value (as the manual
  // attribute picker does); the user then edits it.
  const preselectApplied = useRef(false);
  useEffect(() => {
    if (preselectApplied.current || !preselectAttribute) return;
    const match = writableCoverage.find(
      (c) => c.attribute === preselectAttribute && c.data_types.length === 1,
    );
    if (!match) return;
    preselectApplied.current = true;
    setValue("attribute", match.attribute);
    setValue("attributeDataType", match.data_types[0]);
    setValue("value", currentValueFor(selectedDevices, match.attribute));
  }, [preselectAttribute, writableCoverage, selectedDevices, setValue]);

  const targetValid = selectedDevices.length > 0 && writableCoverage.length > 0;
  const commandValid = isCommandValid(
    values,
    writableCoverage,
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
        data_type: v.attributeDataType,
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
    coverageFilter,
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

function isCommandValid(
  v: WizardFormValues,
  writableCoverage: AttributeCoverage[],
  selectedCount: number,
): boolean {
  if (selectedCount === 0) return false;
  if (!v.attribute) return false;
  const row = writableCoverage.find((c) => c.attribute === v.attribute);
  if (!row || row.data_types.length !== 1) return false;
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
      asset_id: values.targetFilter?.assetId,
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
