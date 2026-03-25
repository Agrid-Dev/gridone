import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./locales/en/common.json";
import enDevices from "./locales/en/devices.json";
import frCommon from "./locales/fr/common.json";
import frDevices from "./locales/fr/devices.json";

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      devices: enDevices,
    },
    fr: {
      common: frCommon,
      devices: frDevices,
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
