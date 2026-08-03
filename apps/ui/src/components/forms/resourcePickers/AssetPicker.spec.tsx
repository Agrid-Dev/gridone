import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Asset } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "pickers.asset.label": "Locations",
    "pickers.asset.placeholder": "Select locations",
    "pickers.asset.search": "Search locations",
    "pickers.asset.noAssets": "No locations found",
  }),
);

const { mockUseAssetTree } = vi.hoisted(() => ({ mockUseAssetTree: vi.fn() }));
vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => mockUseAssetTree(),
}));

// Inline the Radix/cmdk primitives so jsdom can drive them without portals
// and pointer-event quirks — the picker's own wiring is what is under test.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CommandInput: () => null,
  CommandList: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect: () => void;
  }) => (
    <div role="option" onClick={onSelect}>
      {children}
    </div>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

import { AssetPicker } from "./AssetPicker";

const assets: Asset[] = [
  { id: "b1", type: "building", name: "Main", path: ["b1"], position: 0 },
  { id: "z1", type: "zone", name: "Zone 101", path: ["b1", "z1"], position: 0 },
  { id: "z2", type: "zone", name: "Zone 102", path: ["b1", "z2"], position: 1 },
];

function withAssets(list: Asset[] = assets, isLoading = false) {
  mockUseAssetTree.mockReturnValue({
    assetTree: [],
    assetsList: list,
    assetsById: Object.fromEntries(list.map((a) => [a.id, a])),
    isLoading,
  });
}

afterEach(() => {
  cleanup();
  mockUseAssetTree.mockReset();
});

describe("AssetPicker — multi-select", () => {
  it("adds an asset to the selection when picked", () => {
    withAssets();
    const onChange = vi.fn();

    render(<AssetPicker multiple value={["z1"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("option", { name: /Zone 102/ }));

    expect(onChange).toHaveBeenCalledWith(["z1", "z2"]);
  });

  it("removes an already-selected asset when picked again", () => {
    withAssets();
    const onChange = vi.fn();

    render(<AssetPicker multiple value={["z1", "z2"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("option", { name: /Zone 101/ }));

    expect(onChange).toHaveBeenCalledWith(["z2"]);
  });

  it("summarizes the current selection in the trigger", () => {
    withAssets();

    render(<AssetPicker multiple value={["z1", "z2"]} onChange={vi.fn()} />);

    expect(screen.getByRole("combobox")).toHaveTextContent(
      "Zone 101, Zone 102",
    );
  });

  it("shows the placeholder when nothing is selected", () => {
    withAssets();

    render(<AssetPicker multiple value={[]} onChange={vi.fn()} />);

    expect(screen.getByRole("combobox")).toHaveTextContent("Select locations");
  });

  it("names the ancestors so same-named assets stay distinguishable", () => {
    withAssets();

    render(<AssetPicker multiple value={[]} onChange={vi.fn()} />);

    expect(screen.getByRole("option", { name: /Zone 101/ })).toHaveTextContent(
      "Main",
    );
  });
});

describe("AssetPicker — single select", () => {
  it("reports the picked asset id", () => {
    withAssets();
    const onChange = vi.fn();

    render(<AssetPicker value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("select"), { target: { value: "z2" } });

    expect(onChange).toHaveBeenCalledWith("z2");
  });

  it("reports undefined when the selection is cleared", () => {
    withAssets();
    const onChange = vi.fn();

    render(<AssetPicker value="z2" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("select"), { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("AssetPicker — empty states", () => {
  it("renders a skeleton while the tree loads", () => {
    withAssets([], true);

    const { container } = render(
      <AssetPicker multiple value={[]} onChange={vi.fn()} />,
    );

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("says so when the deployment has no assets", () => {
    withAssets([]);

    render(<AssetPicker multiple value={[]} onChange={vi.fn()} />);

    expect(screen.getByText("No locations found")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
