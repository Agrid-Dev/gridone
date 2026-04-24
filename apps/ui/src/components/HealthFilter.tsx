import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type Health = "all" | "healthy" | "faulty";

const HEALTH_VALUES: Health[] = ["all", "healthy", "faulty"];

export function isHealth(value: string | null | undefined): value is Health {
  return value === "all" || value === "healthy" || value === "faulty";
}

export function readHealthParam(searchParams: URLSearchParams): Health {
  const raw = searchParams.get("health");
  return isHealth(raw) ? raw : "all";
}

export function HealthFilter() {
  const { t } = useTranslation("devices");
  const [searchParams, setSearchParams] = useSearchParams();
  const value = readHealthParam(searchParams);

  const handleChange = (next: string) => {
    if (!isHealth(next)) return;
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      if (next === "all") {
        updated.delete("health");
      } else {
        updated.set("health", next);
      }
      return updated;
    });
  };

  return (
    <Tabs value={value} onValueChange={handleChange}>
      <TabsList aria-label={t("devices.health.label")}>
        {HEALTH_VALUES.map((h) => (
          <TabsTrigger key={h} value={h}>
            {t(`devices.health.${h}`)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
