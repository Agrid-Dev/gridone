import type { AttributeValue } from "@/api/devices";

export type AttributeDataType = "int" | "float" | "bool" | "str";

export type WritableAttribute = {
  name: string;
  dataType: AttributeDataType;
  /** Defined when every selected device agrees on the same option set for
   *  this attribute. Absent means free-form input is required. */
  valueOptions?: AttributeValue[];
};

/** How the user described the target. "devices" freezes the selection to an
 *  explicit id list (what the user picked in the table); "filters" captures
 *  the ``asset_id``/``types`` filter that the server re-resolves at each
 *  dispatch, so saved templates follow the asset's current membership. */
export type TargetMode = "devices" | "filters";

/** The filter-mode form state: the narrow subset of DevicesFilter that the
 *  filter-mode UI lets the user edit today. */
export type TargetFilter = {
  assetId?: string;
  types?: string[];
};

/** The form data owned by react-hook-form. Everything else the wizard needs
 *  (filters, asset tree lookups) is derived or held as local UI state. */
export type WizardFormValues = {
  targetMode: TargetMode;
  deviceIds: string[];
  targetFilter: TargetFilter;
  attribute?: string;
  attributeDataType?: AttributeDataType;
  value?: AttributeValue;
  /** Only populated when the user is saving the wizard as a template. */
  templateName?: string;
};

export {
  intersectWritableAttributes,
  deviceMatchesFilter,
  resolveFilter,
  isEmptyFilter,
  resolveAssetSubtreeDeviceIds,
} from "./resolvers";
