import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type {
  AssetCommand,
  AssetCreate,
  AssetUpdate,
  BuildingProfile,
  ReorderRequest,
} from "../types";
import { AssetsResource } from "./assets";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return {
    assets: new AssetsResource(request as unknown as RequestFn),
    request,
  };
}

const CREATE: AssetCreate = { name: "Floor 1", type: "floor", parent_id: "b1" };
const UPDATE: AssetUpdate = { name: "Floor 1 bis" } as AssetUpdate;
const REORDER: ReorderRequest = { ordered_ids: ["a2", "a1"] };
const COMMAND: AssetCommand = {
  attribute: "setpoint",
  value: 21,
  device_type: "thermostat",
  recursive: true,
  confirm: true,
};
const PROFILE: BuildingProfile = { name: "HQ" } as BuildingProfile;

type Case = [
  string,
  (assets: AssetsResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  [
    "list",
    (a) => a.list({ parent_id: "b1", type: "floor" }),
    ["GET", "/assets/", { searchParams: { parent_id: "b1", type: "floor" } }],
  ],
  ["get", (a) => a.get("a1"), ["GET", "/assets/a1"]],
  ["create", (a) => a.create(CREATE), ["POST", "/assets/", { body: CREATE }]],
  [
    "update",
    (a) => a.update("a1", UPDATE),
    ["PUT", "/assets/a1", { body: UPDATE }],
  ],
  ["delete", (a) => a.delete("a1"), ["DELETE", "/assets/a1"]],
  ["getSchema", (a) => a.getSchema(), ["GET", "/assets/schema"]],
  ["getTree", (a) => a.getTree(), ["GET", "/assets/tree"]],
  [
    "getTreeWithDevices",
    (a) => a.getTreeWithDevices(),
    ["GET", "/assets/tree-with-devices"],
  ],
  [
    "reorderChildren",
    (a) => a.reorderChildren("a1", REORDER),
    ["PUT", "/assets/a1/children/order", { body: REORDER }],
  ],
  [
    "sendCommand",
    (a) => a.sendCommand("a1", COMMAND),
    ["POST", "/assets/a1/commands", { body: COMMAND }],
  ],
  ["listDevices", (a) => a.listDevices("a1"), ["GET", "/assets/a1/devices"]],
  [
    "getBuildingProfile",
    (a) => a.getBuildingProfile(),
    ["GET", "/assets/profile"],
  ],
  [
    "setBuildingProfile",
    (a) => a.setBuildingProfile(PROFILE),
    ["PUT", "/assets/profile", { body: PROFILE }],
  ],
  [
    "getBuildingProfileSchema",
    (a) => a.getBuildingProfileSchema(),
    ["GET", "/assets/profile/schema"],
  ],
  ["getModel", (a) => a.getModel("a1"), ["GET", "/assets/a1/model"]],
  [
    "getModelScene",
    (a) => a.getModelScene("a1"),
    [
      "GET",
      "/assets/a1/model/scene.glb",
      { responseType: "blob", searchParams: { v: undefined } },
    ],
  ],
  [
    "getModelScene with version",
    (a) => a.getModelScene("a1", "2026-08-11T12:00:00Z"),
    [
      "GET",
      "/assets/a1/model/scene.glb",
      { responseType: "blob", searchParams: { v: "2026-08-11T12:00:00Z" } },
    ],
  ],
  [
    "getModelSpaces",
    (a) => a.getModelSpaces("a1"),
    ["GET", "/assets/a1/model/spaces"],
  ],
  ["deleteModel", (a) => a.deleteModel("a1"), ["DELETE", "/assets/a1/model"]],
  [
    "importModelTree",
    (a) => a.importModelTree("a1"),
    ["POST", "/assets/a1/model/import-tree"],
  ],
];

describe("AssetsResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { assets, request } = makeResource();

      await expect(invoke(assets)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );

  it("uploadModel posts the file as a multipart FormData body", async () => {
    const { assets, request } = makeResource();
    const file = new Blob([new Uint8Array([1, 2, 3])]);

    await expect(assets.uploadModel("a1", file, "hq.ifc")).resolves.toBe(
      RESULT,
    );

    expect(request).toHaveBeenCalledExactlyOnceWith(
      "POST",
      "/assets/a1/model",
      { body: expect.any(FormData) },
    );
    const call = request.mock.calls[0] as unknown as Parameters<RequestFn>;
    const form = (call[2] as { body: FormData }).body;
    const entry = form.get("file");
    expect(entry).toBeInstanceOf(File);
    expect((entry as File).name).toBe("hq.ifc");
  });

  it("uploadModel keeps the file's own name when none is given", async () => {
    const { assets, request } = makeResource();
    const file = new File([new Uint8Array([1])], "original.ifc");

    await assets.uploadModel("a1", file);

    const call = request.mock.calls[0] as unknown as Parameters<RequestFn>;
    const form = (call[2] as { body: FormData }).body;
    expect((form.get("file") as File).name).toBe("original.ifc");
  });
});
