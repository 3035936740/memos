import i18n, { BackendModule, FallbackLng, FallbackLngObjList } from "i18next";
import { orderBy } from "lodash-es";
import { initReactI18next } from "react-i18next";
import { findNearestMatchedLanguage } from "./utils/i18n";

export const locales = orderBy([
  "ar",
  "bg",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "en-GB",
  "es",
  "et",
  "fa",
  "fi",
  "fr",
  "gl",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ka-GE",
  "ko",
  "lt",
  "lv",
  "mr",
  "nb",
  "nl",
  "pl",
  "pt-PT",
  "pt-BR",
  "ro",
  "ru",
  "sk",
  "sl",
  "sr",
  "sv",
  "th",
  "tr",
  "uk",
  "vi",
  "zh-Hans",
  "zh-Hant",
]);

const fallbacks = {
  "zh-HK": ["zh-Hant", "en"],
  "zh-TW": ["zh-Hant", "en"],
  zh: ["zh-Hans", "en"],
} as FallbackLngObjList;

const customLocaleModules = import.meta.glob("./locales-custom/*.json");

const mergeTranslations = (base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> => {
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeTranslations(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
};

const LazyImportPlugin: BackendModule = {
  type: "backend",
  init: function () {},
  read: function (language, _, callback) {
    const matchedLanguage = findNearestMatchedLanguage(language);
    import(`./locales/${matchedLanguage}.json`)
      .then(async (translationModule: Record<string, unknown>) => {
        const base = (translationModule.default as Record<string, unknown>) ?? translationModule;
        const customLoader = customLocaleModules[`./locales-custom/${matchedLanguage}.json`];
        if (!customLoader) {
          callback(null, base);
          return;
        }
        const customModule = (await customLoader()) as Record<string, unknown>;
        const custom = (customModule.default as Record<string, unknown>) ?? customModule;
        callback(null, mergeTranslations(base, custom));
      })
      .catch(() => {
        Promise.all([import("./locales/en.json"), import("./locales-custom/en.json")])
          .then(([translationModule, customModule]) => {
            const base = (translationModule.default as Record<string, unknown>) ?? translationModule;
            const custom = (customModule.default as Record<string, unknown>) ?? customModule;
            callback(null, mergeTranslations(base, custom));
          })
          .catch((error: unknown) => {
            callback(error as Error, false);
          });
      });
  },
};

i18n
  .use(LazyImportPlugin)
  .use(initReactI18next)
  .init({
    detection: {
      order: ["navigator"],
    },
    interpolation: {
      escapeValue: false,
    },
    fallbackLng: {
      ...fallbacks,
      ...{ default: ["en"] },
    } as FallbackLng,
  });

export default i18n;
export type TLocale = (typeof locales)[number];
