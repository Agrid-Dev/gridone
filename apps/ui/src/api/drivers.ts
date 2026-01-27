import { TransportProtocol } from "./transports";
import { request } from "./request";

type DriverUpdateStrategy = Record<string, boolean | number>;

type ValueAdapterSpec = {
  adapter: string;
  argument: string | number;
};

type AttributeDataType = "str" | "float" | "int" | "bool";

type DriverAttribute = {
  name: string;
  dataType: AttributeDataType;
  valueAdapters: ValueAdapterSpec[];
};

export type Driver = {
  id: string;
  vendor: string | null;
  model: string | null;
  version: string | null;
  transport: TransportProtocol;
  updateStrategy: DriverUpdateStrategy;
  deviceConfig: {
    name: string;
    required: boolean;
  }[];
  attributes: DriverAttribute[];
};

export function getDrivers(): Promise<Driver[]> {
  return request<Driver[]>(`/drivers/`, undefined, { camelCase: true });
}
