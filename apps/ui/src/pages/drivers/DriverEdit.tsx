import { FC } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardFooter, Button } from "@/components/ui";
import { InputController } from "@/components/forms/controllers/InputController";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { useDriverFromRoute, usePatchDriver } from "./useDrivers";
import type { Driver } from "@/api/drivers";

const schema = z.object({
  vendor: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  version: z.number().int().nullable().optional(),
  image_src: z.string().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

const DriverEditForm: FC<{ driver: Driver }> = ({ driver }) => {
  const { t } = useTranslation("drivers");
  const navigate = useNavigate();
  const { handlePatch, patchMutation } = usePatchDriver(driver.id);

  useBreadcrumb([
    { to: `/drivers/${driver.id}`, label: driver.id },
    { to: `/drivers/${driver.id}/edit`, labelKey: "breadcrumb.edit" },
  ]);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      vendor: driver.vendor ?? "",
      model: driver.model ?? "",
      version: driver.version ? Number(driver.version) : undefined,
      image_src: driver.imageSrc ?? "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    await handlePatch({
      vendor: values.vendor || null,
      model: values.model || null,
      version: values.version ?? null,
      image_src: values.image_src || null,
    });
    navigate("..");
  };

  const previewSrc = methods.watch("image_src");

  return (
    <section className="space-y-6">
      <ResourceHeader title={t("actions.edit")} />
      <Card>
        <form onSubmit={methods.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <InputController
                name="vendor"
                control={methods.control}
                label={t("fields.vendor")}
              />
              <InputController
                name="model"
                control={methods.control}
                label={t("fields.model")}
              />
              <InputController
                name="version"
                control={methods.control}
                label={t("fields.version")}
                type="integer"
              />
            </div>
            <TextareaController
              name="image_src"
              control={methods.control}
              label={t("fields.imageSrc")}
              description={t("fields.imageSrcHint")}
              textareaProps={{ rows: 3 }}
            />
            {previewSrc && (
              <div>
                <img
                  src={previewSrc}
                  alt="preview"
                  className="h-40 w-40 rounded-lg object-cover"
                />
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => navigate("..")}
            >
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              type="submit"
              disabled={!methods.formState.isDirty || patchMutation.isPending}
            >
              {t("actions.save", { defaultValue: "Save" })}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </section>
  );
};

const DriverEditContent: FC = () => {
  const driver = useDriverFromRoute();
  return <DriverEditForm driver={driver} />;
};

const DriverEdit: FC = () => {
  const { driverId } = useParams();
  return (
    <ResourceBoundary resetKeys={[driverId]}>
      <DriverEditContent />
    </ResourceBoundary>
  );
};

export default DriverEdit;
