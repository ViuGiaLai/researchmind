import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import vi from "./locales/vi/common.json";
import en from "./locales/en/common.json";
import ja from "./locales/ja/common.json";

const SUPPORTED_LANGS = ["vi", "en", "ja"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export function isValidLang(lang: string | null): lang is SupportedLang {
  return lang !== null && SUPPORTED_LANGS.includes(lang as SupportedLang);
}

const singleBracePostProcessor = {
  type: "postProcessor" as const,
  name: "singleBraceInterpolator",
  process(value: any, _key: string | string[], options: any): any {
    if (typeof value === "string") {
      return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, varName) => {
        if (options && options[varName] !== undefined) {
          return String(options[varName]);
        }
        return match;
      });
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.process(item, _key, options));
    }
    if (value !== null && typeof value === "object") {
      const result: any = {};
      for (const k of Object.keys(value)) {
        result[k] = this.process(value[k], _key, options);
      }
      return result;
    }
    return value;
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .use(singleBracePostProcessor)
  .init({
    resources: {
      vi: { common: vi },
      en: { common: en },
      ja: { common: ja },
    },
    ns: ["common"],
    defaultNS: "common",
    fallbackNS: "common",
    fallbackLng: "vi",
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "researchmind:lang",
      caches: ["localStorage"],
    },
    postProcess: ["singleBraceInterpolator"],
    returnObjects: true,
  });

export function setLanguage(lang: SupportedLang) {
  i18n.changeLanguage(lang);
  try {
    localStorage.setItem("researchmind:lang", lang);
  } catch {
    // storage unavailable
  }
}

export function getCurrentLanguage(): SupportedLang {
  const stored = (() => {
    try {
      return localStorage.getItem("researchmind:lang");
    } catch {
      return null;
    }
  })();
  if (isValidLang(stored)) return stored;
  const nav = (navigator.language || "").split("-")[0];
  if (isValidLang(nav)) return nav;
  return "vi";
}

export default i18n;
