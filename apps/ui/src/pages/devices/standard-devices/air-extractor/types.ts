/** Camel-cased view of the `air_extractor` standard attribute schema
 *  (packages/devices_manager .../standard_schemas/registry/air_extractor.py). */
export type AirExtractorValues = {
  onoffState?: boolean | null;
  fanSpeed?: number | null;
  /** Flow (differential-pressure) switch: `true` when airflow is proven. */
  flowSwitch?: boolean | null;
};
