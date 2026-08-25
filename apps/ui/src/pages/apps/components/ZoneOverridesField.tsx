import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useFieldArray,
  useFormState,
  useWatch,
  type Control,
  type FieldArrayPath,
  type FieldValues,
} from "react-hook-form";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, Input } from "@/components/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { SwitchController } from "@/components/forms/controllers/SwitchController";
import {
  messageAtPath,
  normalizeProperty,
  type JsonSchemaObject,
} from "@/components/forms/schema-form";
import { useAssetTree } from "@/hooks/useAssetTree";
import { toLabel } from "@/lib/textFormat";
import type { AppSchemaNode } from "@/lib/appConfigSchema";
import { ZoneOverridesAddPicker } from "./ZoneOverridesAddPicker";

interface ZoneOverridesFieldProps {
  /** RHF field path, e.g. `zone_overrides`. */
  name: string;
  /** Localized schema node for the `zone_overrides` array property. */
  schema: AppSchemaNode;
  control: Control<FieldValues>;
  required: boolean;
}

/** Row properties this widget renders itself; every other property the app
 *  declares on an override renders generically as a table column. */
const ZONE_FIELD = "zone_id";
const ENABLED_FIELD = "enabled";

/** `zone_overrides`'s sibling object property — the add picker's candidate set
 *  is that list minus rooms already overridden. */
const PILOTED_ZONES_FIELD = "piloted_zones";

/** Resolves a sibling property of `path`, so a prefixed form
 *  (`config.zone_overrides`) still finds `config.piloted_zones` rather than a
 *  top-level field that isn't there. */
const siblingPath = (path: string, sibling: string): string => {
  const lastDot = path.lastIndexOf(".");
  return lastDot === -1 ? sibling : `${path.slice(0, lastDot)}.${sibling}`;
};

type OverrideRow = Record<string, unknown>;

/** Purpose-built table view for `zone_overrides`, mounted through the
 *  app-config override seam ({@link import("./AppConfigField").appConfigOverrides}).
 *  Only rooms with an override are rows (sparse, not one row per piloted
 *  room), so a 400-room hotel with 9 overrides shows 9 rows. Replaces the
 *  generic `SchemaFields`/`ArrayWidget` stacked-card rendering for this one
 *  field: `zone_id` and `enabled` get dedicated columns (room name, editable
 *  toggle), every other declared property (`zone_type`, `comfort`,
 *  check-in/out) renders through the shared per-kind controllers, unlabeled,
 *  as a plain column. */
export const ZoneOverridesField: FC<ZoneOverridesFieldProps> = ({
  name,
  schema,
  control,
  required,
}) => {
  const { t } = useTranslation("apps");
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState("");
  const { assetsById } = useAssetTree();
  const { errors } = useFormState({ control });

  const { fields, append, remove } = useFieldArray({
    control,
    name: name as FieldArrayPath<FieldValues>,
  });

  const pilotedZonesPath = siblingPath(name, PILOTED_ZONES_FIELD);
  const pilotedZoneIds = useWatch({
    control,
    name: pilotedZonesPath,
  }) as string[] | undefined;
  useEffect(() => {
    if (pilotedZoneIds === undefined && import.meta.env.DEV) {
      // eslint-disable-next-line no-console -- dev-only diagnostic
      console.warn(
        `ZoneOverridesField: no sibling field "${pilotedZonesPath}" found — the add picker will offer no rooms.`,
      );
    }
  }, [pilotedZoneIds, pilotedZonesPath]);
  const rows = (useWatch({ control, name }) as OverrideRow[] | undefined) ?? [];

  const zoneNameOf = (zoneId: string | undefined) => {
    if (!zoneId) return "";
    return assetsById[zoneId]?.name ?? zoneId;
  };

  const overriddenZoneIds = new Set(
    rows
      .map((row) => row?.[ZONE_FIELD] as string | undefined)
      .filter((id): id is string => id !== undefined),
  );
  const availableZoneIds = (pilotedZoneIds ?? []).filter(
    (id) => !overriddenZoneIds.has(id),
  );

  const properties = schema.items?.properties ?? {};
  const extraColumns = Object.entries(properties).filter(
    ([propName]) => propName !== ZONE_FIELD && propName !== ENABLED_FIELD,
  );

  const newRowValue = (zoneId: string): OverrideRow => {
    const row: OverrideRow = { [ZONE_FIELD]: zoneId, [ENABLED_FIELD]: true };
    for (const [propName, propSchema] of Object.entries(properties)) {
      if (propName === ZONE_FIELD || propSchema.default === undefined) {
        continue;
      }
      row[propName] = propSchema.default;
    }
    return row;
  };

  const visibleRows = fields
    .map((field, index) => ({
      field,
      index,
      zoneName: zoneNameOf(rows[index]?.[ZONE_FIELD] as string | undefined),
    }))
    .filter(({ zoneName }) =>
      zoneName.toLowerCase().includes(search.toLowerCase()),
    );

  return (
    <FieldSet className="min-w-0 gap-3 md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FieldLegend className="mb-0" variant="label">
            {schema.title} {required && <span aria-hidden="true">*</span>}
          </FieldLegend>
          <Badge variant="info" className="tabular-nums">
            {t("zoneOverrides.count", { count: fields.length })}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {t(expanded ? "zoneOverrides.collapse" : "zoneOverrides.expand")}
          {expanded ? (
            <ChevronUp className="ml-1 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-1 h-4 w-4" />
          )}
        </Button>
      </div>

      {schema.description && (
        <FieldDescription>{schema.description}</FieldDescription>
      )}
      <FieldError>{messageAtPath(errors, name)}</FieldError>

      {expanded && (
        <>
          <div className="flex items-center justify-between gap-3">
            <Input
              placeholder={t("zoneOverrides.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              className="max-w-xs"
            />
            <ZoneOverridesAddPicker
              zoneIds={availableZoneIds}
              onAdd={(zoneId) => append(newRowValue(zoneId))}
            />
          </div>

          {fields.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {t("zoneOverrides.empty")}
            </div>
          )}
          {fields.length > 0 && visibleRows.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {t("zoneOverrides.noResults")}
            </div>
          )}
          {visibleRows.length > 0 && (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">
                    {t("zoneOverrides.columns.zone")}
                  </TableHead>
                  {extraColumns.map(([propName, propSchema]) => (
                    <TableHead key={propName} className="w-32">
                      {propSchema.title ?? toLabel(propName)}
                    </TableHead>
                  ))}
                  <TableHead className="w-24">
                    {t("zoneOverrides.columns.enabled")}
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map(({ field, index, zoneName }) => {
                  const rowName = `${name}.${index}`;
                  return (
                    <TableRow key={field.id}>
                      <TableCell className="font-medium">{zoneName}</TableCell>
                      {extraColumns.map(([propName, propSchema]) => (
                        <TableCell key={propName}>
                          <RowCell
                            name={`${rowName}.${propName}`}
                            schema={propSchema}
                            control={control}
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <SwitchController
                          name={`${rowName}.${ENABLED_FIELD}`}
                          control={control}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("zoneOverrides.remove")}
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </FieldSet>
  );
};

/** One override property beyond `zone_id`/`enabled` (e.g. `zone_type`,
 *  `comfort`, check-in/out), dispatched by kind through the same primitives the
 *  schema-form registry uses — unlabeled, since the column header already
 *  carries the label. */
const RowCell: FC<{
  name: string;
  schema: AppSchemaNode;
  control: Control<FieldValues>;
}> = ({ name, schema, control }) => {
  const descriptor = normalizeProperty(name, schema as JsonSchemaObject, {});

  if (descriptor.kind === "enum") {
    return (
      <SelectController
        name={name}
        control={control}
        options={(descriptor.enumValues ?? []).map((value) => ({
          value: String(value),
          label: toLabel(String(value)),
        }))}
      />
    );
  }
  if (descriptor.kind === "boolean") {
    return <SwitchController name={name} control={control} />;
  }
  if (descriptor.kind === "number" || descriptor.kind === "integer") {
    return <InputController name={name} control={control} type="number" />;
  }
  return <InputController name={name} control={control} type="text" />;
};
