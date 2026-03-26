import "i18next";
import type common from "../locales/en/common.json";
import type devices from "../locales/en/devices.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      devices: typeof devices;
    };
  }
}
