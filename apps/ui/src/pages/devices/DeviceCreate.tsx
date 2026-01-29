import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui";

export default function DeviceCreate() {
  const { t } = useTranslation();

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("devices.create.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {t("devices.create.description")}
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button variant="outline" asChild>
            <Link to="/devices">{t("common.cancel")}</Link>
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
