import { request, requestBlob } from "./request";

export type DataTypeMap = {
  integer: number;
  float: number;
  boolean: boolean;
  string: string;
};

export type DataType = keyof DataTypeMap;

export type TimeSeries<D extends DataType = DataType> = {
  id: string;
  dataType: D;
  ownerId: string;
  metric: string;
  createdAt: string;
  updatedAt: string;
};

export type DataPoint<D extends DataType = DataType> = {
  timestamp: string;
  value: DataTypeMap[D];
  commandId?: number;
};

export function listSeries<D extends DataType = DataType>(
  deviceId: string,
  metric?: string,
): Promise<TimeSeries<D>[]> {
  const params = new URLSearchParams();
  if (metric) params.set("metric", metric);
  const qs = params.toString();
  return request<TimeSeries<D>[]>(
    `/devices/${encodeURIComponent(deviceId)}/timeseries${qs ? `?${qs}` : ""}`,
    undefined,
    { camelCase: true },
  );
}

export type GetSeriesPointsOptions = {
  start?: string;
  end?: string;
  last?: string;
  carryForward?: boolean;
};

function optionsToParams(options?: GetSeriesPointsOptions): URLSearchParams {
  const { start, end, last, carryForward } = options ?? {};
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (last) params.set("last", last);
  if (carryForward !== undefined)
    params.set("carry_forward", String(carryForward));
  return params;
}

export async function exportCsv(
  seriesIds: string[],
  options?: GetSeriesPointsOptions,
): Promise<void> {
  const params = optionsToParams(options);
  for (const id of seriesIds) {
    params.append("series_ids", id);
  }
  const blob = await requestBlob(
    `/devices/timeseries/export/csv?${params.toString()}`,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPng(
  seriesIds: string[],
  options?: GetSeriesPointsOptions,
): Promise<void> {
  const params = optionsToParams(options);
  for (const id of seriesIds) params.append("series_ids", id);
  const blob = await requestBlob(
    `/devices/timeseries/export/png?${params.toString()}`,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export.png";
  a.click();
  URL.revokeObjectURL(url);
}

export function getSeriesPoints<D extends DataType = DataType>(
  deviceId: string,
  attr: string,
  options?: GetSeriesPointsOptions,
): Promise<DataPoint<D>[]> {
  const params = optionsToParams(options);
  const qs = params.toString();
  return request<DataPoint<D>[]>(
    `/devices/${encodeURIComponent(deviceId)}/timeseries/${encodeURIComponent(attr)}${qs ? `?${qs}` : ""}`,
    undefined,
    { camelCase: true },
  );
}
