import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { TargetPresenter } from "./TargetPresenter";

vi.mock("react-i18next", () =>
  createI18nMock({
    "commands.targetPresenter.tag": "{{key}}: {{values}}",
  }),
);
afterEach(cleanup);

it("shows every accepted asset in a multi-asset target", () => {
  render(
    <TargetPresenter
      target={{ tags: { asset_id: ["building", "room", "empty-room"] } }}
    />,
  );
  expect(
    screen.getByText("asset_id: building, room, empty-room"),
  ).toBeVisible();
});
