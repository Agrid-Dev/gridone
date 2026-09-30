import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createI18nMock } from "@/test/i18nMock";
import { WidgetForm } from "../WidgetForm";

vi.mock("react-i18next", () => createI18nMock({}));
let enabled = true;
vi.mock("@/utils/featureFlags", () => ({
  useFeatureEnabled: () => enabled,
}));
let synoptics = [{ id: "plate1", name: "Heating plant" }];
vi.mock("@/pages/synoptics/useSynoptics", () => ({
  useSynoptics: () => synoptics,
}));

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", const: "synoptic", default: "synoptic" },
    synoptic_id: { type: "string", minLength: 1 },
  },
  required: ["synoptic_id"],
};

function renderForm(synopticId?: string) {
  const onSubmit = vi.fn();
  render(
    <WidgetForm
      formId="synoptic-form"
      type="synoptic"
      configSchema={SCHEMA}
      defaultConfig={
        synopticId ? { type: "synoptic", synoptic_id: synopticId } : undefined
      }
      onSubmit={onSubmit}
    />,
  );
  const submit = () =>
    fireEvent.submit(document.getElementById("synoptic-form")!);
  return { onSubmit, submit };
}

beforeEach(() => {
  enabled = true;
  synoptics = [{ id: "plate1", name: "Heating plant" }];
});
afterEach(cleanup);

describe("SynopticConfigFields", () => {
  it("picks a stored document by name and submits its reference", async () => {
    const user = userEvent.setup();
    const { onSubmit, submit } = renderForm();
    submit();
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Heating plant" }));
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: "",
        config: { type: "synoptic", synoptic_id: "plate1" },
      }),
    );
  });

  it("restores the selected document when editing", () => {
    renderForm("plate1");
    expect(screen.getByRole("combobox")).toHaveTextContent("Heating plant");
  });

  it("explains where to create a document when the list is empty", () => {
    synoptics = [];
    renderForm();
    expect(
      screen.getByText("widgets.synoptic.noSynoptics"),
    ).toBeInTheDocument();
  });

  it("preserves an existing reference when synoptics are disabled", async () => {
    enabled = false;
    const { onSubmit, submit } = renderForm("plate1");
    expect(screen.getByText("widgets.synoptic.disabled")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: "",
        config: { type: "synoptic", synoptic_id: "plate1" },
      }),
    );
  });
});
