import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ApiError } from "@/api/apiError";
import { ResourceNotFoundError } from "@/lib/errors";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "errors.notFound": "Not found",
    "errors.default": "Something went wrong",
    "common.back": "Back",
    "common.home": "Home",
  }),
);

// Imported after the mock so the transitive react-i18next import resolves to
// the mocked module.
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { renderWithBoundary } from "@/test/renderWithBoundary";

const Throw = ({ error }: { error: unknown }) => {
  throw error;
};

const Suspends = () => {
  useSuspenseQuery({
    queryKey: ["pending"],
    queryFn: () => new Promise<string>(() => {}),
  });
  return <div>loaded</div>;
};

// Error boundaries log the caught error to console.error; silence it so the
// suite output stays readable.
let consoleError: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleError.mockRestore();
});
afterEach(cleanup);

describe("ResourceBoundary", () => {
  it("maps a ResourceNotFoundError to the not-found fallback", () => {
    renderWithBoundary(<Throw error={new ResourceNotFoundError()} />);
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });

  it("maps an ApiError(404) to the not-found fallback", () => {
    renderWithBoundary(<Throw error={new ApiError(404, "Not Found", "")} />);
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });

  it("maps a non-404 ApiError to the generic error fallback", () => {
    renderWithBoundary(<Throw error={new ApiError(500, "Server Error", "")} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("maps an arbitrary error to the generic error fallback", () => {
    renderWithBoundary(<Throw error={new Error("boom")} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows the Suspense fallback while the resource loads", () => {
    renderWithBoundary(<Suspends />, { fallback: <div>loading…</div> });
    expect(screen.getByText("loading…")).toBeInTheDocument();
    expect(screen.queryByText("loaded")).not.toBeInTheDocument();
  });

  it("resets after the reset keys change", () => {
    const Maybe = ({ boom }: { boom: boolean }) => {
      if (boom) throw new ResourceNotFoundError();
      return <div>recovered</div>;
    };

    const { rerender } = render(
      <ResourceBoundary resetKeys={["a"]}>
        <Maybe boom />
      </ResourceBoundary>,
    );
    expect(screen.getByText("Not found")).toBeInTheDocument();

    rerender(
      <ResourceBoundary resetKeys={["b"]}>
        <Maybe boom={false} />
      </ResourceBoundary>,
    );
    expect(screen.getByText("recovered")).toBeInTheDocument();
    expect(screen.queryByText("Not found")).not.toBeInTheDocument();
  });
});
