import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import type { AssetTreeNode } from "@/api/assets";
import {
  dispatchBatchCommand,
  dispatchSingleCommand,
  type AttributeValue,
} from "@/api/commands";
import type { Device } from "@/api/devices";
import {
  intersectWritableAttributes,
  resolveAssetSubtreeDeviceIds,
  type WizardContext,
  type WizardFormValues,
  type WritableAttribute,
} from "./types";

export type UseCommandWizardArgs = {
  context: WizardContext;
  devices: Device[];
  assetTree: AssetTreeNode[];
  lockedDeviceId?: string;
  lockedAssetId?: string;
};

type DispatchResult = { kind: "single" } | { kind: "batch"; groupId: string };

const DRAFT_KEY = "commands.wizard.draft";
const DRAFT_DEBOUNCE_MS = 250;

export function useCommandWizard({
  context,
  devices,
  assetTree,
  lockedDeviceId,
  lockedAssetId,
}: UseCommandWizardArgs) {
  const { t } = useTranslation("devices");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Where the wizard opens the first time it renders. Users can always navigate
  // all the way back to step 0 from there via Back.
  const initialStep = context === "device" ? 1 : 0;

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
        deviceIds: initialDeviceIds,
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

  const selectedDevices = useMemo(
    () => devices.filter((d) => values.deviceIds.includes(d.id)),
    [devices, values.deviceIds],
  );

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

  const targetValid = isTargetValid(values, compatibleAttributes);
  const commandValid = isCommandValid(values, compatibleAttributes);

  // -- Actions --------------------------------------------------------------
  const mutation = useMutation<DispatchResult, Error, WizardFormValues>({
    mutationFn: (v) => dispatch(v),
    onSuccess: (result) => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["commands"] });
      if (result.kind === "batch") {
        toast.success(t("commands.new.feedback.batchDispatched"));
        navigate(`/devices/history?group_id=${result.groupId}`);
      } else {
        toast.success(t("commands.new.feedback.dispatched"));
        const listUrl = lockedDeviceId
          ? `/devices/${encodeURIComponent(lockedDeviceId)}/history/commands`
          : "/devices/history";
        navigate(listUrl);
      }
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? err.detail || err.message
          : t("commands.new.feedback.dispatchFailed");
      toast.error(String(detail));
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
    navigate(-1);
  };

  const handleSubmit = () => mutation.mutate(getValues());

  return {
    control,
    setValue,
    values,
    step,
    selectedDevices,
    compatibleAttributes,
    targetValid,
    commandValid,
    isSubmitting: mutation.isPending,
    handleNext,
    handleBack,
    handleCancel,
    handleSubmit,
  };
}

function parseStep(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n)) return fallback;
  return Math.max(0, Math.min(2, n - 1));
}

function isTargetValid(
  v: WizardFormValues,
  compatibleAttrs: WritableAttribute[],
): boolean {
  return v.deviceIds.length > 0 && compatibleAttrs.length > 0;
}

function isCommandValid(
  v: WizardFormValues,
  compatibleAttrs: WritableAttribute[],
): boolean {
  if (!v.attribute) return false;
  if (!compatibleAttrs.some((a) => a.name === v.attribute)) return false;
  return v.value !== undefined && v.value !== "";
}

async function dispatch(v: WizardFormValues): Promise<DispatchResult> {
  if (!v.attribute || v.value === undefined) {
    throw new Error("Form incomplete");
  }
  if (v.deviceIds.length === 0) {
    throw new Error("No devices selected");
  }
  const attribute = v.attribute;
  const value = v.value as AttributeValue;

  if (v.deviceIds.length === 1) {
    await dispatchSingleCommand(v.deviceIds[0], { attribute, value });
    return { kind: "single" };
  }

  const res = await dispatchBatchCommand({
    attribute,
    value,
    deviceIds: v.deviceIds,
  });
  return { kind: "batch", groupId: res.groupId };
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
