import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { serverErrorMessage } from "@/lib/serverErrorMessage";

/** Keep async confirmations open until success and reject repeated submission
 *  synchronously. A refusal shows the server's own message when it has one —
 *  `serverErrorMessage` withholds it for the errors ADR 0002 keeps internal —
 *  and `errorLabel` otherwise, which defaults to the deletion wording. */
export function useConfirmation(
  onConfirm: () => Promise<unknown>,
  onOpenChange: (open: boolean) => void,
  errorLabel?: string,
) {
  const { t } = useTranslation();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changeOpen = (open: boolean) => {
    if (locked.current) return;
    setError(null);
    onOpenChange(open);
  };
  const confirm = async () => {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      setError(serverErrorMessage(error) ?? errorLabel ?? t("deletion.error"));
    } finally {
      locked.current = false;
      setPending(false);
    }
  };
  return { pending, error, changeOpen, confirm };
}
