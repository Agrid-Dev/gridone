import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enApps from "./locales/en/apps.json";
import enAssets from "./locales/en/assets.json";
import enCommon from "./locales/en/common.json";
import enDevices from "./locales/en/devices.json";
import enDrivers from "./locales/en/drivers.json";
import enTransports from "./locales/en/transports.json";
import enUsers from "./locales/en/users.json";
import frApps from "./locales/fr/apps.json";
import frAssets from "./locales/fr/assets.json";
import frCommon from "./locales/fr/common.json";
import frDevices from "./locales/fr/devices.json";
import frDrivers from "./locales/fr/drivers.json";
import frTransports from "./locales/fr/transports.json";
import frUsers from "./locales/fr/users.json";

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      devices: enDevices,
      users: enUsers,
      assets: enAssets,
      transports: enTransports,
      apps: enApps,
      drivers: enDrivers,
    },
    fr: {
      common: frCommon,
      devices: frDevices,
      users: frUsers,
      assets: frAssets,
      transports: frTransports,
      apps: frApps,
      drivers: frDrivers,
    },
  },
  defaultNS: "common",
  lng: "fr", // Default language is French
  fallbackLng: "fr",
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

export default i18n;
