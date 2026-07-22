import "i18next";
import type apps from "../locales/en/apps.json";
import type assets from "../locales/en/assets.json";
import type automations from "../locales/en/automations.json";
import type profile from "../locales/en/profile.json";
import type common from "../locales/en/common.json";
import type dashboards from "../locales/en/dashboards.json";
import type devices from "../locales/en/devices.json";
import type drivers from "../locales/en/drivers.json";
import type faults from "../locales/en/faults.json";
import type home from "../locales/en/home.json";
import type notifications from "../locales/en/notifications.json";
import type standardDevices from "../locales/en/standardDevices.json";
import type transports from "../locales/en/transports.json";
import type users from "../locales/en/users.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      dashboards: typeof dashboards;
      devices: typeof devices;
      users: typeof users;
      assets: typeof assets;
      automations: typeof automations;
      transports: typeof transports;
      apps: typeof apps;
      drivers: typeof drivers;
      faults: typeof faults;
      home: typeof home;
      notifications: typeof notifications;
      standardDevices: typeof standardDevices;
      profile: typeof profile;
    };
  }
}
