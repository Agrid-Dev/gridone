import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  AttributeDriver,
  AttributePatch,
  AttributeRename,
  Driver,
  DriverInput,
  DriverPatch,
  DriverYaml,
  FaultAttributeDriver,
} from "../types";

export type DriverListParams = NonNullable<
  operations["list_drivers_drivers__get"]["parameters"]["query"]
>;

/** Driver attributes come in two flavours: regular and fault attributes. */
export type DriverAttribute = AttributeDriver | FaultAttributeDriver;

/** `client.drivers` — yaml-based device drivers and their attributes. */
export class DriversResource {
  constructor(private readonly request: RequestFn) {}

  list(params?: DriverListParams): Promise<Driver[]> {
    return this.request("GET", "/drivers/", { searchParams: params });
  }

  get(driverId: string): Promise<Driver> {
    return this.request("GET", `/drivers/${encodeURIComponent(driverId)}`);
  }

  /**
   * Creates (or fully replaces) a driver under a caller-chosen id, from a
   * structured spec or a raw yaml document.
   */
  create(driverId: string, spec: DriverInput | DriverYaml): Promise<Driver> {
    return this.request("PUT", `/drivers/${encodeURIComponent(driverId)}`, {
      body: spec,
    });
  }

  update(driverId: string, params: DriverPatch): Promise<Driver> {
    return this.request("PATCH", `/drivers/${encodeURIComponent(driverId)}`, {
      body: params,
    });
  }

  delete(driverId: string): Promise<void> {
    return this.request("DELETE", `/drivers/${encodeURIComponent(driverId)}`);
  }

  /** Creates (or fully replaces) one driver attribute. */
  setAttribute(
    driverId: string,
    attributeId: string,
    params: DriverAttribute,
  ): Promise<DriverAttribute> {
    return this.request(
      "PUT",
      `/drivers/${encodeURIComponent(driverId)}/attributes/${encodeURIComponent(attributeId)}`,
      { body: params },
    );
  }

  updateAttribute(
    driverId: string,
    attributeId: string,
    params: AttributePatch,
  ): Promise<DriverAttribute> {
    return this.request(
      "PATCH",
      `/drivers/${encodeURIComponent(driverId)}/attributes/${encodeURIComponent(attributeId)}`,
      { body: params },
    );
  }

  /** Removes the attribute and returns the updated driver. */
  deleteAttribute(driverId: string, attributeId: string): Promise<Driver> {
    return this.request(
      "DELETE",
      `/drivers/${encodeURIComponent(driverId)}/attributes/${encodeURIComponent(attributeId)}`,
    );
  }

  renameAttribute(
    driverId: string,
    attributeId: string,
    params: AttributeRename,
  ): Promise<DriverAttribute> {
    return this.request(
      "POST",
      `/drivers/${encodeURIComponent(driverId)}/attributes/${encodeURIComponent(attributeId)}/rename`,
      { body: params },
    );
  }
}
