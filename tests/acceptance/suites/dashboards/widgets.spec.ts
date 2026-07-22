import { isGridoneError, type GridoneClient } from "@gridone/sdk";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { makeAdminClient } from "../../lib/api";

// The `text` widget config is a discriminated union member; narrow to read its
// type-specific fields in assertions.
type TextConfigView = { type: string; text: string; color: string };

const TEXT_CONFIG = { type: "text" as const, text: "hello", color: "#1a2b3c" };

describe("dashboard widgets", () => {
  let client: GridoneClient;
  const createdIds: string[] = [];

  beforeAll(async () => {
    client = await makeAdminClient();
  });

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop();
      if (id) {
        await client.dashboards.delete(id).catch(() => undefined);
      }
    }
  });

  async function createDashboard(): Promise<string> {
    const created = await client.dashboards.create({
      name: `acceptance-widgets-${createdIds.length}-${Date.now()}`,
    });
    createdIds.push(created.id);
    return created.id;
  }

  it("adds a text widget at the type's default size", async () => {
    const id = await createDashboard();

    const widget = await client.dashboards.addWidget(id, {
      config: TEXT_CONFIG,
      title: "Note",
    });

    expect(widget.type).toBe("text");
    expect(widget.layout).toMatchObject({ x: 0, y: 0, w: 4, h: 2 });
    expect((widget.config as TextConfigView).text).toBe("hello");
  });

  it("rejects a widget with a non-hex color with a 422", async () => {
    const id = await createDashboard();

    let error: unknown = null;
    try {
      await client.dashboards.addWidget(id, {
        config: { type: "text", text: "x", color: "red" },
      });
    } catch (caught) {
      error = caught;
    }
    expect(isGridoneError(error) && error.status === 422).toBe(true);
  });

  it("updates a widget's title and config", async () => {
    const id = await createDashboard();
    const widget = await client.dashboards.addWidget(id, {
      config: TEXT_CONFIG,
    });

    const updated = await client.dashboards.updateWidget(id, widget.id, {
      title: "Renamed",
      config: { type: "text", text: "bye", color: "#ffffff" },
    });

    expect(updated.title).toBe("Renamed");
    expect((updated.config as TextConfigView).text).toBe("bye");
  });

  it("removes a widget and its layout item", async () => {
    const id = await createDashboard();
    const widget = await client.dashboards.addWidget(id, {
      config: TEXT_CONFIG,
    });

    await client.dashboards.removeWidget(id, widget.id);

    const fetched = await client.dashboards.get(id);
    expect(fetched.widgets).toEqual([]);
    expect(fetched.layout).toEqual([]);
  });

  it("returns 404 when removing an unknown widget", async () => {
    const id = await createDashboard();

    let error: unknown = null;
    try {
      await client.dashboards.removeWidget(id, "does-not-exist");
    } catch (caught) {
      error = caught;
    }
    expect(isGridoneError(error) && error.status === 404).toBe(true);
  });

  it("replaces the grid layout, writing geometry onto widgets", async () => {
    const id = await createDashboard();
    const w1 = await client.dashboards.addWidget(id, { config: TEXT_CONFIG });
    const w2 = await client.dashboards.addWidget(id, { config: TEXT_CONFIG });

    const updated = await client.dashboards.updateLayout(id, [
      { i: w1.id, x: 0, y: 0, w: 6, h: 3 },
      { i: w2.id, x: 6, y: 0, w: 6, h: 3 },
    ]);

    const item = updated.layout.find((l) => l.i === w1.id);
    expect(item).toMatchObject({ x: 0, y: 0, w: 6, h: 3 });
  });

  it("rejects an incomplete layout (not one item per widget) with a 422", async () => {
    const id = await createDashboard();
    const w1 = await client.dashboards.addWidget(id, { config: TEXT_CONFIG });
    await client.dashboards.addWidget(id, { config: TEXT_CONFIG });

    let error: unknown = null;
    try {
      // Only one item for a two-widget dashboard.
      await client.dashboards.updateLayout(id, [
        { i: w1.id, x: 0, y: 0, w: 4, h: 2 },
      ]);
    } catch (caught) {
      error = caught;
    }
    expect(isGridoneError(error) && error.status === 422).toBe(true);
  });

  it("exposes the text widget JSON Schema with its hex color pattern", async () => {
    const schemas = await client.dashboards.getWidgetSchemas();

    expect(schemas.text).toBeDefined();
    const properties = (
      schemas.text as { properties: Record<string, { pattern?: string }> }
    ).properties;
    expect(properties.color?.pattern).toBe("^#[0-9a-fA-F]{6}$");
  });
});
