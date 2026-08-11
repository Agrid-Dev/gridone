import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { AppIcon } from "./AppIcon";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppIcon", () => {
  it.each(["hotel", "cloud-sun"])(
    "renders the %s Lucide icon instead of its manifest name",
    async (name) => {
      const { container, queryByText } = render(<AppIcon name={name} />);

      expect(queryByText(name)).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          container.querySelector(`svg[data-icon-name="${name}"]`),
        ).toBeInTheDocument(),
      );
    },
  );

  it.each([undefined, "", "not-a-lucide-icon"])(
    "renders a neutral fallback for %s without asking Lucide to load it",
    (name) => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const { container } = render(<AppIcon name={name} />);

      expect(container.querySelector("svg.lucide-blocks")).toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalled();
    },
  );
});
