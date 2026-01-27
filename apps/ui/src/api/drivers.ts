import { TransportProtocol } from "./transports";
import { request } from "./request";

type DriverUpdateStrategy = Record<string, boolean | number>;

type ValueAdapterSpec = {
  adapter: string;
  argument: string | number;
};

type AttributeDataType = "str" | "float" | "int" | "bool";

type Address = Record<string, unknown>;

export type DriverAttribute = {
  name: string;
  dataType: AttributeDataType;
  valueAdapters: ValueAdapterSpec[];
  read?: Address;
  write?: Address;
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
