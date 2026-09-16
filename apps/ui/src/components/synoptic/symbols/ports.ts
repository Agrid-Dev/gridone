import {
  symbolSchemas,
  type Cell,
  type Side,
  type SymbolPort,
} from "@gridone/sdk";
import { rotateQuarter, rotateSide } from "../projection";

/** The collector's authored shape: which way the bar runs, how long it is,
 *  and where along it each port sits. Mirrors the backend's `CollectorProps`;
 *  the generated schema only carries it as JSON Schema, so the field names
 *  are checked against it in the tests. */
export type CollectorProps = {
  axis: "x" | "y";
  length: number;
  ports: Record<string, { offset: number; side: Side }>;
};

export type PortAnchor = { cell: Cell; side: Side };

/** Each offset authored along the bar, as a cell offset from the origin.
 *  The same rule as the backend's `collector_ports`. */
export function collectorPorts(
  props: CollectorProps,
): Record<string, SymbolPort> {
  return Object.fromEntries(
    Object.entries(props.ports).map(([name, port]) => [
      name,
      {
        offset:
          props.axis === "x"
            ? { x: port.offset, y: 0, z: 0 }
            : { x: 0, y: port.offset, z: 0 },
        side: port.side,
      },
    ]),
  );
}

/**
 * The cell and face a pipe attaches to: the type's port offset turned by
 * the symbol's rotation and moved to its origin. A collector reads its
 * ports off `props` instead of the type. Undefined, named in the console
 * in development, for a type or port the bundled registry does not know:
 * the schemas are a build-time snapshot, so a plate stored by a newer
 * backend degrades one run at a time rather than unmounting the plate.
 */
export function symbolPort(
  type: string,
  origin: Cell,
  rotation: number,
  name: string,
  props?: CollectorProps,
): PortAnchor | undefined {
  const schema = symbolSchemas[type];
  const ports = schema
    ? schema["x-ports-authored"] && props
      ? collectorPorts(props)
      : schema["x-ports"]
    : {};
  const port = ports[name];
  if (!port) {
    if (import.meta.env.DEV) {
      console.warn(
        schema
          ? `Symbol type ${type} has no port ${name}`
          : `Unknown symbol type ${type}`,
      );
    }
    return undefined;
  }
  const r = rotateQuarter(port.offset, rotation);
  return {
    cell: {
      x: origin.x + r.x,
      y: origin.y + r.y,
      z: (origin.z ?? 0) + (port.offset.z ?? 0),
    },
    side: rotateSide(port.side, rotation),
  };
}
