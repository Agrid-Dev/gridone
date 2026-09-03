import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { SelectController } from "./SelectController";

type Values = { usage: "office" | "other" | null };

/** Minimal form around the controller; `onChange` reports the field value
 *  after every submit so the test reads what react-hook-form holds. */
function Harness({
  initial,
  onSubmit,
}: {
  initial: Values["usage"];
  onSubmit: (values: Values) => void;
}) {
  const form = useForm<Values>({ defaultValues: { usage: initial } });
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <SelectController
        name="usage"
        control={form.control}
        label="Usage"
        options={[
          { value: "office", label: "Office" },
          { value: "other", label: "Other" },
        ]}
        allowEmpty
        emptyValue={null}
        emptyLabel="Unclassified"
      />
      <button type="submit">Save</button>
    </form>
  );
}

afterEach(cleanup);

describe("SelectController with an empty item", () => {
  it("shows the empty label for an empty field and lists it as an option", async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} onSubmit={vi.fn()} />);

    const trigger = screen.getByRole("combobox", { name: "Usage" });
    expect(trigger).toHaveTextContent("Unclassified");

    await user.click(trigger);
    expect(
      screen.getByRole("option", { name: "Unclassified" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Office" })).toBeInTheDocument();
  });

  it("resets the field to the empty value when the empty item is picked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(values: Values) => void>();
    render(<Harness initial="office" onSubmit={onSubmit} />);

    const trigger = screen.getByRole("combobox", { name: "Usage" });
    expect(trigger).toHaveTextContent("Office");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Unclassified" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    // react-hook-form also passes the submit event, so read the values only.
    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ usage: null }),
    );
    expect(trigger).toHaveTextContent("Unclassified");
  });

  it("keeps regular options typed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(values: Values) => void>();
    render(<Harness initial={null} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("combobox", { name: "Usage" }));
    await user.click(screen.getByRole("option", { name: "Other" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ usage: "other" }),
    );
  });
});
