import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { symbolSchemas } from "@gridone/sdk";
import { Button } from "@/components/ui/button";

type PaletteProps = {
  /** The type armed for the next click on the canvas. */
  placing: string | null;
  onPick: (type: string | null) => void;
};

const TYPES = Object.keys(symbolSchemas).sort();

/** Every symbol type the registry publishes. Picking one arms it; the
 *  next click on the plate places it, picking it again disarms. */
export const Palette: FC<PaletteProps> = ({ placing, onPick }) => {
  const { t } = useTranslation("synoptics");
  return (
    <div
      role="toolbar"
      aria-label={t("editor.palette")}
      className="flex flex-wrap gap-1"
    >
      {TYPES.map((type) => (
        <Button
          key={type}
          type="button"
          size="sm"
          variant={placing === type ? "default" : "outline"}
          aria-pressed={placing === type}
          onClick={() => onPick(placing === type ? null : type)}
        >
          {type.replace(/_/g, " ")}
        </Button>
      ))}
    </div>
  );
};
