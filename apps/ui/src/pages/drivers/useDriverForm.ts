import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { DriverPackageInput } from "./useDriverPackage";

// Matches the raw value of a top-level `id:` field, e.g. "id: my_driver".
const DRIVER_ID_LINE = /^id:[ \t]*(.+?)[ \t]*$/m;
// Matches a fully-quoted scalar, e.g. `"my_driver"` or `'my_driver'`.
const QUOTED_SCALAR = /^(["'])((?:(?!\1).)*)\1$/;

/** Read the top-level id from pasted YAML; full validation belongs to the server. */
function extractDriverId(yaml: string): string {
  const line = yaml.match(DRIVER_ID_LINE);
  if (!line) {
    throw new Error("Driver YAML must include a top-level 'id' field");
  }
  const rawValue = line[1];
  const quoted = rawValue.match(QUOTED_SCALAR);
  // An unquoted YAML comment starts with whitespace followed by "#".
  const id = quoted ? quoted[2] : rawValue.split(/[ \t]+#/)[0].trim();
  if (!id) {
    throw new Error("Driver YAML must include a top-level 'id' field");
  }
  return id;
}

export function useDriverForm(
  onSubmit: (payload: DriverPackageInput) => Promise<void>,
  driverId?: string,
) {
  const { t } = useTranslation("drivers");
  const schema = z
    .object({
      source: z.enum(["yaml", "file"]),
      driverId: z.string().trim(),
      yaml: z.string(),
      file: z.instanceof(File).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.source === "file") {
        if (!data.file)
          ctx.addIssue({
            code: "custom",
            path: ["file"],
            message: t("package.fileRequired"),
          });
        if (!data.driverId)
          ctx.addIssue({
            code: "custom",
            path: ["driverId"],
            message: t("package.idRequired"),
          });
      } else {
        if (!data.yaml.trim())
          ctx.addIssue({
            code: "custom",
            path: ["yaml"],
            message: t("package.yamlRequired"),
          });
        else if (!driverId) {
          try {
            extractDriverId(data.yaml);
          } catch {
            ctx.addIssue({
              code: "custom",
              path: ["yaml"],
              message: t("package.yamlIdRequired"),
            });
          }
        }
      }
    });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { source: "yaml", driverId: driverId ?? "", yaml: "" },
  });
  const source = useWatch({ control: form.control, name: "source" });
  const sourceField = form.register("source", {
    onChange: () => form.resetField("file"),
  });
  const submit = form.handleSubmit(async (data) => {
    const id =
      driverId ??
      (data.source === "file" ? data.driverId : extractDriverId(data.yaml));
    const body =
      data.source === "file"
        ? new Blob([data.file!], {
            type: data.file!.name.toLowerCase().endsWith(".zip")
              ? "application/zip"
              : "application/yaml",
          })
        : new Blob([data.yaml], { type: "application/yaml" });
    await onSubmit({ driverId: id, body });
  });
  return { form, source, sourceField, submit };
}
