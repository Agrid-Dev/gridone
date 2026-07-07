import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  AggregateOptionsResponse,
  AggregationResultResponse,
  FetchPointsResultResponse,
  TimeSeries,
  TimeseriesBulkPushRequest,
  TimeseriesSingleAttrPushRequest,
} from "../types";

export type TimeseriesListParams = NonNullable<
  operations["list_device_timeseries_devices__device_id__timeseries_get"]["parameters"]["query"]
>;
export type TimeseriesPointsParams = NonNullable<
  operations["get_device_timeseries_points_devices__device_id__timeseries__attr__get"]["parameters"]["query"]
>;
export type TimeseriesAggregateParams = NonNullable<
  operations["get_device_timeseries_aggregate_devices__device_id__timeseries__attr__aggregate_get"]["parameters"]["query"]
>;
export type AggregateOptionsParams = NonNullable<
  operations["get_aggregate_options_devices_timeseries_aggregate_options_get"]["parameters"]["query"]
>;
/** Shared by the CSV and PNG exports (same query parameters). */
export type TimeseriesExportParams = NonNullable<
  operations["export_timeseries_csv_devices_timeseries_export_csv_get"]["parameters"]["query"]
>;

/**
 * `client.timeseries` — recorded device metrics. Series are addressed by
 * device id + attribute name, matching the wire paths under `/devices/`.
 */
export class TimeseriesResource {
  constructor(private readonly request: RequestFn) {}

  /** Lists the series recorded for a device. */
  list(deviceId: string, params?: TimeseriesListParams): Promise<TimeSeries[]> {
    return this.request(
      "GET",
      `/devices/${encodeURIComponent(deviceId)}/timeseries`,
      { searchParams: params },
    );
  }

  getPoints(
    deviceId: string,
    attribute: string,
    params?: TimeseriesPointsParams,
  ): Promise<FetchPointsResultResponse> {
    return this.request(
      "GET",
      `/devices/${encodeURIComponent(deviceId)}/timeseries/${encodeURIComponent(attribute)}`,
      { searchParams: params },
    );
  }

  aggregate(
    deviceId: string,
    attribute: string,
    params: TimeseriesAggregateParams,
  ): Promise<AggregationResultResponse> {
    return this.request(
      "GET",
      `/devices/${encodeURIComponent(deviceId)}/timeseries/${encodeURIComponent(attribute)}/aggregate`,
      { searchParams: params },
    );
  }

  /** Aggregation intervals/operators valid for the given time window. */
  getAggregateOptions(
    params?: AggregateOptionsParams,
  ): Promise<AggregateOptionsResponse> {
    return this.request("GET", "/devices/timeseries/aggregate/options", {
      searchParams: params,
    });
  }

  /** Pushes external history points for several attributes of a device. */
  push(deviceId: string, params: TimeseriesBulkPushRequest): Promise<void> {
    return this.request(
      "POST",
      `/devices/${encodeURIComponent(deviceId)}/timeseries`,
      { body: params },
    );
  }

  /** Pushes external history points for one attribute of a device. */
  pushAttribute(
    deviceId: string,
    attribute: string,
    params: TimeseriesSingleAttrPushRequest,
  ): Promise<void> {
    return this.request(
      "POST",
      `/devices/${encodeURIComponent(deviceId)}/timeseries/${encodeURIComponent(attribute)}`,
      { body: params },
    );
  }

  exportCsv(params: TimeseriesExportParams): Promise<string> {
    return this.request("GET", "/devices/timeseries/export/csv", {
      searchParams: params,
      responseType: "text",
    });
  }

  exportPng(params: TimeseriesExportParams): Promise<Blob> {
    return this.request("GET", "/devices/timeseries/export/png", {
      searchParams: params,
      responseType: "blob",
    });
  }
}
