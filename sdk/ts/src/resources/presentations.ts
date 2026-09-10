import type { RequestFn } from "../http/httpClient";
import type { PresentationSchema } from "../types";

/** The supported dialect and import budgets, for presentation authoring tools. */
export class PresentationsResource {
  constructor(private readonly request: RequestFn) {}

  schema(): Promise<PresentationSchema> {
    return this.request("GET", "/presentations/schema");
  }
}
