import type { RequestFn } from "../http/httpClient";
import type {
  App,
  RegistrationRequestCreateBody,
  RegistrationRequestResponse,
} from "../types";

/** `client.apps.registrationRequests` — app registration workflow. */
export class AppRegistrationRequestsResource {
  constructor(private readonly request: RequestFn) {}

  list(): Promise<RegistrationRequestResponse[]> {
    return this.request("GET", "/apps/registration-requests");
  }

  get(requestId: string): Promise<RegistrationRequestResponse> {
    return this.request(
      "GET",
      `/apps/registration-requests/${encodeURIComponent(requestId)}`,
    );
  }

  create(
    params: RegistrationRequestCreateBody,
  ): Promise<RegistrationRequestResponse> {
    return this.request("POST", "/apps/registration-requests", {
      body: params,
    });
  }

  accept(requestId: string): Promise<RegistrationRequestResponse> {
    return this.request(
      "POST",
      `/apps/registration-requests/${encodeURIComponent(requestId)}/accept`,
    );
  }

  discard(requestId: string): Promise<RegistrationRequestResponse> {
    return this.request(
      "POST",
      `/apps/registration-requests/${encodeURIComponent(requestId)}/discard`,
    );
  }
}

/** `client.apps` — registered building applications and their config. */
export class AppsResource {
  /** Registration requests (`/apps/registration-requests`). */
  readonly registrationRequests: AppRegistrationRequestsResource;

  constructor(private readonly request: RequestFn) {
    this.registrationRequests = new AppRegistrationRequestsResource(request);
  }

  list(): Promise<App[]> {
    return this.request("GET", "/apps/");
  }

  get(appId: string): Promise<App> {
    return this.request("GET", `/apps/${encodeURIComponent(appId)}`);
  }

  enable(appId: string): Promise<App> {
    return this.request("POST", `/apps/${encodeURIComponent(appId)}/enable`);
  }

  disable(appId: string): Promise<App> {
    return this.request("POST", `/apps/${encodeURIComponent(appId)}/disable`);
  }

  /** App config objects are app-defined, hence untyped. */
  getConfig(appId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/apps/${encodeURIComponent(appId)}/config`);
  }

  updateConfig(
    appId: string,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request("PATCH", `/apps/${encodeURIComponent(appId)}/config`, {
      body: config,
    });
  }

  /** JSON schema the app declares for its config. */
  getConfigSchema(appId: string): Promise<Record<string, unknown>> {
    return this.request(
      "GET",
      `/apps/${encodeURIComponent(appId)}/config/schema`,
    );
  }
}
