import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CommandTemplateResponse } from "@gridone/sdk";

// Mock the SDK client at the context boundary so the hook's POST/PATCH
// branching is observable via call inspection.
const { mockedCreate, mockedUpdate } = vi.hoisted(() => ({
  mockedCreate: vi.fn(),
  mockedUpdate: vi.fn(),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      commandTemplates: {
        create: (...args: unknown[]) => mockedCreate(...args),
        update: (...args: unknown[]) => mockedUpdate(...args),
      },
    },
  }),
}));

import { useCommandTemplate } from "./useCommandTemplate";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PAYLOAD = {
  target: { ids: ["d1"] },
  write: {
    attribute: "mode",
    value: "auto" as const,
    data_type: "str" as const,
  },
  name: null,
};

const mkTemplate = (
  id: string,
  name: string | null = null,
): CommandTemplateResponse => ({
  id,
  name,
  target: { ids: ["d1"] },
  write: { attribute: "mode", value: "auto", data_type: "str" },
  created_at: "2026-05-01T00:00:00Z",
  created_by: "u1",
});

beforeEach(() => {
  mockedCreate.mockReset();
  mockedUpdate.mockReset();
});

describe("useCommandTemplate", () => {
  it("posts a fresh template when no initialId is provided", async () => {
    mockedCreate.mockResolvedValue(mkTemplate("t-new"));
    const { result } = renderHook(() => useCommandTemplate(), { wrapper });

    let resolved: CommandTemplateResponse | undefined;
    await act(async () => {
      resolved = await result.current.commit(PAYLOAD);
    });

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(resolved!.id).toBe("t-new");
  });

  it("patches when initialId is provided", async () => {
    mockedUpdate.mockResolvedValue(mkTemplate("t-existing", "Saved"));
    const { result } = renderHook(
      () => useCommandTemplate({ initialId: "t-existing" }),
      { wrapper },
    );

    await act(async () => {
      await result.current.commit({ ...PAYLOAD, name: "Saved" });
    });

    expect(mockedUpdate).toHaveBeenCalledWith("t-existing", {
      target: PAYLOAD.target,
      write: PAYLOAD.write,
      name: "Saved",
    });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("tracks the resolved id so a second commit patches the first POST's row", async () => {
    // Re-saves are the whole point of the wizard owning the lifecycle —
    // the user editing their command and hitting Save twice must not
    // orphan the first template.
    mockedCreate.mockResolvedValue(mkTemplate("t-from-post"));
    mockedUpdate.mockResolvedValue(mkTemplate("t-from-post", "Saved"));
    const { result } = renderHook(() => useCommandTemplate(), { wrapper });

    await act(async () => {
      await result.current.commit(PAYLOAD);
    });
    await waitFor(() => expect(result.current.resolvedId).toBe("t-from-post"));

    await act(async () => {
      await result.current.commit({ ...PAYLOAD, name: "Saved" });
    });

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(mockedUpdate).toHaveBeenCalledWith("t-from-post", expect.anything());
  });
});
