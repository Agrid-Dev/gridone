import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "fields.secretConfigured": "Configured",
    "fields.secretReplace": "Replace",
    "fields.secretCancel": "Cancel",
  }),
);

import { SecretFieldController } from "./SecretFieldController";

type HarnessProps = {
  configured: boolean;
  revealing: boolean;
  onReveal?: () => void;
  onCancel?: () => void;
};

function Harness({
  configured,
  revealing,
  onReveal = vi.fn(),
  onCancel = vi.fn(),
}: HarnessProps) {
  const { control } = useForm({ defaultValues: { client_key: null } });
  return (
    <SecretFieldController
      name="client_key"
      control={control}
      label="Client key"
      configured={configured}
      revealing={revealing}
      onReveal={onReveal}
      onCancel={onCancel}
    />
  );
}

afterEach(cleanup);

describe("SecretFieldController", () => {
  it("unconfigured: renders a password input", () => {
    render(<Harness configured={false} revealing={false} />);
    const input = screen.getByLabelText("Client key");
    expect(input).toHaveProperty("type", "password");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("configured + untouched: shows Configured with a Replace button, no input", () => {
    render(<Harness configured={true} revealing={false} />);
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Client key")).not.toBeInTheDocument();
  });

  it("clicking Replace calls onReveal", () => {
    const onReveal = vi.fn();
    render(<Harness configured={true} revealing={false} onReveal={onReveal} />);
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it("configured + revealing: shows a password input and a Cancel button", () => {
    render(<Harness configured={true} revealing={true} />);
    const input = screen.getByLabelText("Client key");
    expect(input).toHaveProperty("type", "password");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("clicking Cancel calls onCancel", () => {
    const onCancel = vi.fn();
    render(<Harness configured={true} revealing={true} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("object secret: renders one input per sub-field instead of a single scalar input", () => {
    function ObjectHarness() {
      const { control } = useForm({
        defaultValues: { secure_credentials: null },
      });
      return (
        <SecretFieldController
          name="secure_credentials"
          control={control}
          label="Secure credentials"
          configured={false}
          revealing={false}
          onReveal={vi.fn()}
          onCancel={vi.fn()}
          objectFields={[
            {
              name: "device_authentication_password",
              label: "Device authentication password",
              type: "password",
              required: true,
            },
            { name: "user_id", label: "User id", type: "number" },
          ]}
        />
      );
    }
    render(<ObjectHarness />);
    expect(
      screen.getByLabelText(/Device authentication password/),
    ).toHaveProperty("type", "password");
    expect(screen.getByLabelText(/User id/)).toHaveProperty("type", "number");
    expect(
      screen.queryByLabelText(/^Secure credentials$/),
    ).not.toBeInTheDocument();
  });
});
