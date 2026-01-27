import { TransportProtocol } from "./transports";

type DriverUpdateStrategy = Record<string, boolean | number>;

type ValueAdapterSpec = {
  adapter: string;
  argument: string | number;
};

type AttributeDataType = "str" | "float" | "int" | "bool";

type DriverAttribute = {
  name: string;
  dataType: AttributeDataType;
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
