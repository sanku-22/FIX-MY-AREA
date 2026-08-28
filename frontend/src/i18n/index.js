import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import hi from "./hi.json";

const saved = localStorage.getItem("cf_lang") || "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: saved,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLanguage(lng) {
  localStorage.setItem("cf_lang", lng);
  i18n.changeLanguage(lng);
}

export default i18n;
