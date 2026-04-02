import "i18next";
import type apps from "../locales/en/apps.json";
import type assets from "../locales/en/assets.json";
import type common from "../locales/en/common.json";
import type devices from "../locales/en/devices.json";
import type drivers from "../locales/en/drivers.json";
import type transports from "../locales/en/transports.json";
import type users from "../locales/en/users.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      devices: typeof devices;
      users: typeof users;
      assets: typeof assets;
      transports: typeof transports;
      apps: typeof apps;
      drivers: typeof drivers;
    };
  }
}
