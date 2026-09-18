import type { RequestFn } from "../http/httpClient";
import type {
  Page,
  Synoptic,
  SynopticDocument,
  SynopticSummary,
} from "../types";

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

  /** Stores a new plate; the whole document is validated on save. */
  create(document: SynopticDocument): Promise<Synoptic> {
    return this.request("POST", "/synoptics/", { body: document });
  }

  /** Replaces a plate whole. `expectedUpdatedAt` is the `updated_at` the
   *  author read; the save is refused with a 409 if the plate moved since. */
  replace(
    synopticId: string,
    document: SynopticDocument,
    expectedUpdatedAt: string,
  ): Promise<Synoptic> {
    return this.request("PUT", `/synoptics/${encodeURIComponent(synopticId)}`, {
      body: document,
      searchParams: { expected_updated_at: expectedUpdatedAt },
    });
  }
}
