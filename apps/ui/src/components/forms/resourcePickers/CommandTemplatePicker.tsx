import { useQuery } from "@tanstack/react-query";
import { listTemplates, CommandTemplate } from "@/api/commands";
import { FieldShell } from "../controllers/FieldShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FC, ComponentProps } from "react";
import { useTranslation } from "react-i18next";

const useCommandTemplates = () =>
  useQuery({
    queryKey: ["command-templates"],
    queryFn: () => listTemplates(),
  });

interface SelectPickerProps extends Pick<
  ComponentProps<typeof FieldShell>,
  "label"
> {
  templates: CommandTemplate[];
  value?: string;
  onSelect: (t: CommandTemplate) => void;
}

const TemplatePicker: FC<SelectPickerProps> = ({
  label,
  templates,
  value,
  onSelect,
}) => {
  const { t } = useTranslation("devices");
  return (
    <FieldShell id="trigger-type-picker" label={label}>
      <Select
        onValueChange={(templateId: string) => {
          const template = templates.find((t) => t.id === templateId);
          if (template) onSelect(template);
        }}
        value={value ?? ""}
      >
        <SelectTrigger className="w-full sm:w-80">
          <SelectValue placeholder={t("commands.pickATemplate")} />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
};

const TemplatePickerWrapper: FC<Omit<SelectPickerProps, "templates">> = (
  props,
) => {
  const { data, isLoading } = useCommandTemplates();

  if (isLoading) {
    return <Skeleton className="h-8 w-3/4" />;
  }
  const templates = data?.items;

  if (!templates) {
    return <div>No templates available</div>;
  }

  return <TemplatePicker templates={templates} {...props} />;
};

export default TemplatePickerWrapper;
