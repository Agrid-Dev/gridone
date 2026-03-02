import { request, API_BASE_URL } from "./request";
import { getStoredToken } from "./token";

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
};

export function listSeries<D extends DataType = DataType>(
  ownerId?: string,
  metric?: string,
): Promise<TimeSeries<D>[]> {
  const params = new URLSearchParams();
  if (ownerId) params.set("owner_id", ownerId);
  if (metric) params.set("metric", metric);
  const qs = params.toString();
  return request<TimeSeries<D>[]>(
    `/timeseries/${qs ? `?${qs}` : ""}`,
    undefined,
    {
      camelCase: true,
    },
  );
}

export type GetSeriesPointsOptions = {
  start?: string;
  end?: string;
  last?: string;
  carryForward?: boolean;
};

export async function exportCsv(
  seriesIds: string[],
  options?: GetSeriesPointsOptions,
): Promise<void> {
  const { start, end, last, carryForward } = options ?? {};
  const params = new URLSearchParams();
  for (const id of seriesIds) {
    params.append("series_ids", id);
  }
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (last) params.set("last", last);
  if (carryForward !== undefined)
    params.set("carry_forward", String(carryForward));

  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(
    `${API_BASE_URL}/timeseries/export/csv?${params.toString()}`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function getSeriesPoints<D extends DataType = DataType>(
  seriesId: string,
  options?: GetSeriesPointsOptions,
): Promise<DataPoint<D>[]> {
  const { start, end, last, carryForward } = options ?? {};
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (last) params.set("last", last);
  if (carryForward !== undefined)
    params.set("carry_forward", String(carryForward));
  const qs = params.toString();
  return request<DataPoint<D>[]>(
    `/timeseries/${encodeURIComponent(seriesId)}/points${qs ? `?${qs}` : ""}`,
    undefined,
    { camelCase: true },
  );
}
