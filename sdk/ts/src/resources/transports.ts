import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  DiscoveryHandler,
  DiscoveryHandlerCreate,
  Transport,
  TransportCreate,
  TransportUpdate,
} from "../types";

/** JSON schema of each transport protocol's config, keyed by protocol. */
export type TransportSchemas =
  operations["get_transport_schemas_transports_schemas__get"]["responses"]["200"]["content"]["application/json"];

/** `client.transports` — protocol clients (http, mqtt, bacnet, ...) and discovery. */
export class TransportsResource {
  constructor(private readonly request: RequestFn) {}

  list(): Promise<Transport[]> {
    return this.request("GET", "/transports/");
  }

  get(transportId: string): Promise<Transport> {
    return this.request(
      "GET",
      `/transports/${encodeURIComponent(transportId)}`,
    );
  }

  create(params: TransportCreate): Promise<Transport> {
    return this.request("POST", "/transports/", { body: params });
  }

  update(transportId: string, params: TransportUpdate): Promise<Transport> {
    return this.request(
      "PATCH",
      `/transports/${encodeURIComponent(transportId)}`,
      { body: params },
    );
  }

  delete(transportId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/transports/${encodeURIComponent(transportId)}`,
    );
  }

  getSchemas(): Promise<TransportSchemas> {
    return this.request("GET", "/transports/schemas/");
  }

  listDiscoveryHandlers(transportId: string): Promise<DiscoveryHandler[]> {
    return this.request(
      "GET",
      `/transports/${encodeURIComponent(transportId)}/discovery/`,
    );
  }

  createDiscoveryHandler(
    transportId: string,
    params: DiscoveryHandlerCreate,
  ): Promise<DiscoveryHandler> {
    return this.request(
      "POST",
      `/transports/${encodeURIComponent(transportId)}/discovery/`,
      { body: params },
    );
  }

  deleteDiscoveryHandler(transportId: string, driverId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/transports/${encodeURIComponent(transportId)}/discovery/${encodeURIComponent(driverId)}`,
    );
  }
}
