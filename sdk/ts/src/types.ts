/**
 * Public API types for @gridone/sdk.
 *
 * Thin aliases over the generated OpenAPI types (`src/generated/openapi.ts`,
 * produced by `npm run generate-types`). Keys are verbatim wire format
 * (snake_case) — what the OpenAPI docs show and what crosses the network is
 * exactly what the editor shows.
 *
 * Names follow the OpenAPI component names, except:
 * - `DriverSpec-Output` / `DriverSpec-Input` → `Driver` / `DriverInput`
 * - `TimeSeriesResponse` / `DataPointResponse` → `TimeSeries` / `DataPoint`
 * - `DiscoveryHandlerDTO` / `DiscoveryHandlerCreateDTO` →
 *   `DiscoveryHandler` / `DiscoveryHandlerCreate`
 * - the monomorphized `PaginatedResponse_*_` schemas → the `Page<T>` generic
 * - `Transport` names the discriminated union served by the transports API
 *
 * `src/types.spec.ts` holds compile-time assertions that keep the manual
 * shapes (`Page<T>`, `Transport`, renames) in sync with the generated ones.
 */
import type { components } from "./generated/openapi";

// Raw generated types, for advanced use (endpoint-level lookups, etc.).
export type { components, operations, paths } from "./generated/openapi";

type Schemas = components["schemas"];

// Pagination
export type PaginationLinks = Schemas["PaginationLinks"];
export type SortOrder = Schemas["SortOrder"];

/**
 * Generic page envelope. The OpenAPI docs expose one monomorphized schema
 * per resource (`PaginatedResponse_UnitCommand_`, …); this generic replaces
 * them all.
 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
  links: PaginationLinks;
}

// Health
export type HealthResponse = Schemas["HealthResponse"];

// Auth & users
export type TokenResponse = Schemas["TokenResponse"];
export type MeResponse = Schemas["MeResponse"];
export type User = Schemas["User"];
export type UserBasic = Schemas["UserBasic"];
export type UserCreateRequest = Schemas["UserCreateRequest"];
export type UserUpdateRequest = Schemas["UserUpdateRequest"];
export type UserType = Schemas["UserType"];
export type Role = Schemas["Role"];
export type RegistrationRequestCreateBody =
  Schemas["RegistrationRequestCreateBody"];
export type RegistrationRequestResponse =
  Schemas["RegistrationRequestResponse"];

// Building
export type BuildingProfile = Schemas["BuildingProfile"];

// Apps
export type App = Schemas["App"];
export type AppStatus = Schemas["AppStatus"];

// Assets
export type Asset = Schemas["Asset"];
export type AssetCreate = Schemas["AssetCreate"];
export type AssetUpdate = Schemas["AssetUpdate"];
export type AssetType = Schemas["AssetType"];
export type AssetCommand = Schemas["AssetCommand"];
export type ReorderRequest = Schemas["ReorderRequest"];
export type TagValueBody = Schemas["TagValueBody"];

// Devices
export type Device = Schemas["Device"];
export type DeviceCreate = Schemas["DeviceCreate"];
export type DeviceUpdate = Schemas["DeviceUpdate"];
export type DevicesFilterBody = Schemas["DevicesFilterBody"];
export type DeviceConfigField = Schemas["DeviceConfigField"];
export type ConnectionStatus = Schemas["ConnectionStatus"];
export type FaultView = Schemas["FaultView"];
export type Severity = Schemas["Severity"];

// Attributes
export type Attribute = Schemas["Attribute"];
/**
 * Value of a device attribute on the wire — the backend's
 * `AttributeValueType` (str | int | float | bool). Derived from the generated
 * command value field so it tracks the OpenAPI schema.
 */
export type AttributeValueType = Schemas["UnitCommand"]["value"];
export type FaultAttribute = Schemas["FaultAttribute"];
export type AttributeKind = Schemas["AttributeKind"];
export type AttributeDriver = Schemas["AttributeDriver"];
export type FaultAttributeDriver = Schemas["FaultAttributeDriver"];
export type AttributePatch = Schemas["AttributePatch"];
export type AttributeRename = Schemas["AttributeRename"];
export type AttributeWritePayload = Schemas["AttributeWritePayload"];
export type AttributeEventLog = Schemas["AttributeEventLog"];
export type AttributeLogs = Schemas["AttributeLogs"];
export type EventType = Schemas["EventType"];
export type DataType = Schemas["DataType"];
export type StandardAttributeSchema = Schemas["StandardAttributeSchema"];
export type StandardAttributeSchemaField =
  Schemas["StandardAttributeSchemaField"];

// Drivers
export type Driver = Schemas["DriverSpec-Output"];
export type DriverInput = Schemas["DriverSpec-Input"];
export type DriverYaml = Schemas["DriverYaml"];
export type DriverPatch = Schemas["DriverPatch"];
export type CodecSpec = Schemas["CodecSpec"];
export type UpdateStrategy = Schemas["UpdateStrategy"];

// Transports
export type HttpTransport = Schemas["HttpTransport"];
export type KnxTransport = Schemas["KnxTransport"];
export type MqttTransport = Schemas["MqttTransport"];
export type ModbusTcpTransport = Schemas["ModbusTcpTransport"];
export type MbusTransport = Schemas["MbusTransport"];
export type BacnetTransport = Schemas["BacnetTransport"];

/** Discriminated union (on `protocol`) of every transport kind the API serves. */
export type Transport =
  | HttpTransport
  | KnxTransport
  | MqttTransport
  | ModbusTcpTransport
  | MbusTransport
  | BacnetTransport;

export type TransportCreate = Schemas["TransportCreate"];
export type TransportUpdate = Schemas["TransportUpdate"];
export type TransportProtocols = Schemas["TransportProtocols"];
export type TransportConnectionState = Schemas["TransportConnectionState"];
export type BaseTransportConfig = Schemas["BaseTransportConfig"];
export type HttpTransportConfig = Schemas["HttpTransportConfig"];
export type KNXTransportConfig = Schemas["KNXTransportConfig"];
export type KNXSecureCredentials = Schemas["KNXSecureCredentials"];
export type MqttTransportConfig = Schemas["MqttTransportConfig"];
export type ModbusTCPTransportConfig = Schemas["ModbusTCPTransportConfig"];
export type MBusTransportConfig = Schemas["MBusTransportConfig"];
export type BacnetTransportConfig = Schemas["BacnetTransportConfig"];
export type BacnetWritePriority = Schemas["BacnetWritePriority"];
export type RawTransportAddress = Schemas["RawTransportAddress"];

// Discovery
export type DiscoveryHandler = Schemas["DiscoveryHandlerDTO"];
export type DiscoveryHandlerCreate = Schemas["DiscoveryHandlerCreateDTO"];

// Commands
export type SingleDeviceCommand = Schemas["SingleDeviceCommand"];
export type BatchDeviceCommand = Schemas["BatchDeviceCommand"];
export type UnitCommand = Schemas["UnitCommand"];
export type CommandStatus = Schemas["CommandStatus"];
export type BatchDispatchResponse = Schemas["BatchDispatchResponse"];
export type CommandTemplateResponse = Schemas["CommandTemplateResponse"];
export type CommandTemplateCreatePayload =
  Schemas["CommandTemplateCreatePayload"];
export type CommandTemplateUpdatePayload =
  Schemas["CommandTemplateUpdatePayload"];

// Timeseries
export type TimeSeries = Schemas["TimeSeriesResponse"];
export type DataPoint = Schemas["DataPointResponse"];
export type FetchPointsResultResponse = Schemas["FetchPointsResultResponse"];
export type AggregationOperator = Schemas["AggregationOperator"];
export type AggregateOptionsResponse = Schemas["AggregateOptionsResponse"];
export type AggregatedPointResponse = Schemas["AggregatedPointResponse"];
export type AggregationResultResponse = Schemas["AggregationResultResponse"];
export type IntervalOption = Schemas["IntervalOption"];
export type TimeseriesPushPoint = Schemas["TimeseriesPushPoint"];
export type TimeseriesBulkPushRequest = Schemas["TimeseriesBulkPushRequest"];
export type SingleAttrTimeseriesPushPoint =
  Schemas["SingleAttrTimeseriesPushPoint"];
export type TimeseriesSingleAttrPushRequest =
  Schemas["TimeseriesSingleAttrPushRequest"];

// Automations
export type Automation = Schemas["Automation"];
export type AutomationCreate = Schemas["AutomationCreate"];
export type AutomationUpdate = Schemas["AutomationUpdate"];
export type AutomationExecution = Schemas["AutomationExecution"];
export type ExecutionStatus = Schemas["ExecutionStatus"];
export type Action = Schemas["Action"];
export type Trigger = Schemas["Trigger"];

// Notifications
export type Notification = Schemas["Notification"];
export type NotificationDispatch = Schemas["NotificationDispatch"];
export type DispatchNotificationRequest =
  Schemas["DispatchNotificationRequest"];

// Validation errors (422 payloads)
export type HTTPValidationError = Schemas["HTTPValidationError"];
export type ValidationError = Schemas["ValidationError"];
