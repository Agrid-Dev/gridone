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
    yaml: z.string().min(50),
  });
  const methods = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });

  const navigate = useNavigate();
  return (
    <Card>
      <CardContent className="py-4">
        <form id="driver-form" onSubmit={methods.handleSubmit(onSubmit)}>
          <TextareaController
            label="Driver yaml"
            placeholder="Paste here the yaml file for the driver"
            name="yaml"
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
