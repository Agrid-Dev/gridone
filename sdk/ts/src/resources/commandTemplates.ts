import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  BatchDispatchResponse,
  CommandTemplateCreatePayload,
  CommandTemplateResponse,
  CommandTemplateUpdatePayload,
  Page,
} from "../types";

export type CommandTemplateListParams = NonNullable<
  operations["list_templates_devices_commands_templates__get"]["parameters"]["query"]
>;

/** `client.devices.commandTemplates` — reusable batch command templates. */
export class CommandTemplatesResource {
  constructor(private readonly request: RequestFn) {}

  list(
    params?: CommandTemplateListParams,
  ): Promise<Page<CommandTemplateResponse>> {
    return this.request("GET", "/devices/commands/templates/", {
      searchParams: params,
    });
  }

  get(templateId: string): Promise<CommandTemplateResponse> {
    return this.request(
      "GET",
      `/devices/commands/templates/${encodeURIComponent(templateId)}`,
    );
  }

  create(
    params: CommandTemplateCreatePayload,
  ): Promise<CommandTemplateResponse> {
    return this.request("POST", "/devices/commands/templates/", {
      body: params,
    });
  }

  update(
    templateId: string,
    params: CommandTemplateUpdatePayload,
  ): Promise<CommandTemplateResponse> {
    return this.request(
      "PATCH",
      `/devices/commands/templates/${encodeURIComponent(templateId)}`,
      { body: params },
    );
  }

  delete(templateId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/devices/commands/templates/${encodeURIComponent(templateId)}`,
    );
  }

  /** Dispatches the template's commands as a batch. */
  dispatch(templateId: string): Promise<BatchDispatchResponse> {
    return this.request(
      "POST",
      `/devices/commands/templates/${encodeURIComponent(templateId)}/dispatch`,
    );
  }
}
