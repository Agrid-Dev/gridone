import { request } from "./request";

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
  return request<TimeSeries<D>[]>(`/timeseries/${qs ? `?${qs}` : ""}`, undefined, {
    camelCase: true,
  });
}

export function getSeriesPoints<D extends DataType = DataType>(
  seriesId: string,
  start?: string,
  end?: string,
): Promise<DataPoint<D>[]> {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  return request<DataPoint<D>[]>(
    `/timeseries/${encodeURIComponent(seriesId)}/points${qs ? `?${qs}` : ""}`,
    undefined,
    { camelCase: true },
  );
}
