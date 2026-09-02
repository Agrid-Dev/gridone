import { useTranslation } from "react-i18next";
import { type MeResponse } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { PasswordChangeCard } from "./PasswordChangeCard";

type ForcedPasswordChangeProps = {
  user: MeResponse;
  refreshMe: () => Promise<MeResponse>;
  onLogout: () => void;
};

/** Shown instead of the app while `must_change_password` is set. */
export function ForcedPasswordChange({
  user,
  refreshMe,
  onLogout,
}: ForcedPasswordChangeProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-grid px-6 py-12">
      <div className="w-full max-w-2xl space-y-4">
        <PasswordChangeCard user={user} refreshMe={refreshMe} />
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={onLogout}>
            {t("auth.logout")}
          </Button>
        </div>
      </div>
    </div>
  );
}
