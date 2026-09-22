import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SingleCommandPreview } from "@gridone/sdk";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { attributeValueText } from "@/lib/attributeValueLabel";
import { localize } from "@/lib/localizedText";
import { commandReasons } from "@/lib/commandReasons";

type ConfirmationRequest = {
  attribute: string;
  value: string | number | boolean;
  preview: SingleCommandPreview;
  language: string;
  signal: AbortSignal;
  trigger: HTMLElement | null;
};
type Pending = ConfirmationRequest & {
  finish: (accepted: boolean) => void;
  trigger: HTMLElement | null;
};
type RequestConfirmation = (request: ConfirmationRequest) => Promise<boolean>;
const Context = createContext<RequestConfirmation>(async () => false);

/** One accessible modal at a time; each request retains its own frozen action. */
export function AttributeConfirmationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  const [queue, setQueue] = useState<Pending[]>([]);
  const pending = useRef(new Set<Pending>());
  const lastTrigger = useRef<HTMLElement | null>(null);
  const request = useCallback<RequestConfirmation>(
    (input) =>
      new Promise((resolve) => {
        if (input.signal.aborted) return resolve(false);
        const item: Pending = {
          ...input,
          trigger: input.trigger,
          finish: (accepted) => {
            if (!pending.current.delete(item)) return;
            input.signal.removeEventListener("abort", abort);
            setQueue((current) => current.filter((entry) => entry !== item));
            resolve(accepted);
          },
        };
        const abort = () => item.finish(false);
        input.signal.addEventListener("abort", abort, { once: true });
        pending.current.add(item);
        setQueue((current) => [...current, item]);
      }),
    [],
  );
  useEffect(() => {
    const requests = pending.current;
    return () => {
      for (const item of requests) item.finish(false);
    };
  }, []);
  const item = queue[0];
  useEffect(() => {
    if (item) lastTrigger.current = item.trigger;
  }, [item]);
  const preview = item?.preview;
  const previous =
    preview?.current_value == null
      ? t("confirmation.unknown")
      : attributeValueText(item.attribute, preview.current_value, tCommon);
  return (
    <Context.Provider value={request}>
      {children}
      <Dialog
        open={!!item}
        onOpenChange={(open) => {
          if (!open) item?.finish(false);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = lastTrigger.current;
            // Let the cancelled preparation release the disabled control first.
            setTimeout(() => {
              if (trigger?.isConnected) trigger.focus();
            }, 0);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("confirmation.title")}</DialogTitle>
            <DialogDescription>
              {preview?.user_confirmation &&
                localize(preview.user_confirmation, item.language)}
              {preview?.consent_required && (
                <span className="block mt-2 text-amber-700">
                  {commandReasons(preview.reasons, item.language)}{" "}
                  {t("confirmation.unknownOperatingRule")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {item && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt>{t("commands.device")}</dt>
              <dd>{preview?.name || preview?.device_id}</dd>
              <dt>{t("commands.attribute")}</dt>
              <dd>
                {preview?.attribute_label
                  ? localize(preview.attribute_label, item.language)
                  : item.attribute}
              </dd>
              <dt>{t("groups.before")}</dt>
              <dd>
                {previous}
                {preview?.unit ? ` ${preview.unit}` : ""}
              </dd>
              <dt>{t("groups.after")}</dt>
              <dd>
                {attributeValueText(item.attribute, item.value, tCommon)}
                {preview?.unit ? ` ${preview.unit}` : ""}
              </dd>
            </dl>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              autoFocus
              onClick={() => item?.finish(false)}
            >
              {t("confirmation.cancel")}
            </Button>
            <Button onClick={() => item?.finish(true)}>
              {t("confirmation.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}

export function useAttributeConfirmation() {
  return useContext(Context);
}
