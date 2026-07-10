import { FC } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TypographyH2 } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { useEditBuildingProfile } from "@/hooks/useBuildingProfile";
import { BuildingProfileForm } from "./BuildingProfileForm";
import { Card } from "@/components/ui";

const BuildingProfileEdit: FC = () => {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const { schema, profile, save } = useEditBuildingProfile();

  if (schema.isLoading || profile.isLoading) {
    return (
      <section className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </section>
    );
  }

  if (schema.isError || !schema.data) {
    return <p className="text-sm text-muted-foreground">{t("loadError")}</p>;
  }

  // Form fields are schema-native (snake_case), same as the SDK wire format.
  const defaultValues = (profile.data ?? {}) as Record<string, unknown>;

  const handleSubmit = (values: Record<string, unknown>) => {
    save.mutate(values, {
      onSuccess: () => {
        toast.success(t("saved"));
        navigate("/");
      },
      onError: (error: Error) => toast.error(error.message),
    });
  };

  return (
    <section className="space-y-6">
      <Card className="space-y-6 p-6">
        <TypographyH2>{t("title")}</TypographyH2>
        <BuildingProfileForm
          schema={schema.data}
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          isPending={save.isPending}
        />
      </Card>
    </section>
  );
};

export default BuildingProfileEdit;
