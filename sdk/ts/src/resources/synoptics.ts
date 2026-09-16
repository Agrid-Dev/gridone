import type { RequestFn } from "../http/httpClient";
import type { Page, Synoptic, SynopticSummary } from "../types";

/** `client.synoptics`: stored plates, the index and one document. */
export class SynopticsResource {
  constructor(private readonly request: RequestFn) {}

  /** Envelopes only (no symbols or pipes), one page. */
  list(): Promise<Page<SynopticSummary>> {
    return this.request("GET", "/synoptics/");
  }

  /** The full stored document. */
  get(synopticId: string): Promise<Synoptic> {
    return this.request("GET", `/synoptics/${encodeURIComponent(synopticId)}`);
  }
}
