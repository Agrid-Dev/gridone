import { FC } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui";
import { Button } from "@/components/ui";
import * as z from "zod";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import { DriverCreatePayload } from "@/api/drivers";

type DriverFormProps = {
  onSubmit: SubmitHandler<DriverCreatePayload>;
};

const DriverForm: FC<DriverFormProps> = ({ onSubmit }) => {
  const schema = z.object({
    driverJson: z
      .string()
      .min(2)
      .refine((value) => {
        try {
          const parsed = JSON.parse(value);
          return typeof parsed === "object" && parsed !== null;
        } catch {
          return false;
        }
      }, "Driver payload must be a valid JSON object."),
  });
  type DriverFormValues = z.infer<typeof schema>;
  const methods = useForm<DriverFormValues>({
    resolver: zodResolver(schema),
  });
  const handleSubmit: SubmitHandler<DriverFormValues> = (values) =>
    onSubmit(JSON.parse(values.driverJson) as DriverCreatePayload);

  const navigate = useNavigate();
  return (
    <Card>
      <CardContent className="py-4">
        <form id="driver-form" onSubmit={methods.handleSubmit(handleSubmit)}>
          <TextareaController
            label="Driver JSON"
            placeholder="Paste a DriverDTO JSON payload"
            name="driverJson"
            control={methods.control}
            textareaProps={{ rows: 10 }}
            required
          />
        </form>
      </CardContent>
      <CardFooter className="flex justify-end gap-4 mt-4">
        <Button variant="outline" onClick={() => navigate("..")}>
          cancel
        </Button>
        <Button
          type="submit"
          form="driver-form"
          disabled={!methods.formState.isDirty}
        >
          Submit
        </Button>
      </CardFooter>
    </Card>
  );
};

export default DriverForm;
