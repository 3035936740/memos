import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import {
  getBrowserLocale,
  getLocaleDirection,
  getLocalePreferenceWithFallback,
  getLocaleWithFallback,
  loadLocale,
  subscribeToLocaleDirection,
} from "@/utils/i18n";

const originalLanguage = i18n.language;
const originalLangAttribute = document.documentElement.getAttribute("lang");
const originalDirAttribute = document.documentElement.getAttribute("dir");

const restoreAttribute = (name: "lang" | "dir", value: string | null) => {
  if (value === null) {
    document.documentElement.removeAttribute(name);
  } else {
    document.documentElement.setAttribute(name, value);
  }
};

describe("document locale direction", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    restoreAttribute("lang", originalLangAttribute);
    restoreAttribute("dir", originalDirAttribute);
    await i18n.changeLanguage(originalLanguage);
  });

  it.each([
    ["ar", "rtl"],
    ["fa", "rtl"],
    ["he", "rtl"],
    ["en", "ltr"],
  ] as const)("sets %s as a %s document", (locale, direction) => {
    loadLocale(locale);

    expect(document.documentElement).toHaveAttribute("lang", locale);
    expect(document.documentElement).toHaveAttribute("dir", direction);
  });

  it("notifies direction consumers before translations finish loading", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLocaleDirection(listener);

    loadLocale("ar");

    expect(getLocaleDirection()).toBe("rtl");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it.each([
    [["de-AT"], "de"],
    [["xx-ZZ", "ja-JP"], "ja"],
    [["invalid_locale", "fr-CA"], "fr"],
    [["zh-HK"], "zh-Hant"],
    [["zh-TW"], "zh-Hant"],
    [["zh-CN"], "zh-Hans"],
    [["en-GB"], "en-GB"],
    [["pt-PT"], "pt-PT"],
    [["ar-EG"], "ar"],
    [["no-NO"], "nb"],
    [["xx-ZZ"], "en"],
  ])("matches browser preferences %j to %s", (languages, expected) => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
    expect(getBrowserLocale()).toBe(expected);
  });

  it("keeps auto as the saved preference while resolving document language and direction", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["ar-EG"]);
    expect(loadLocale("auto")).toBe("ar");
    expect(localStorage.getItem("memos-locale")).toBe("auto");
    expect(getLocalePreferenceWithFallback()).toBe("auto");
    expect(getLocaleWithFallback()).toBe("ar");
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
  });

  it("preserves explicit choices and account priority over automatic browser matching", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["ja-JP"]);
    loadLocale("en");
    expect(getLocaleWithFallback()).toBe("en");
    expect(getLocaleWithFallback("auto")).toBe("ja");
    expect(getLocaleWithFallback("de", "auto")).toBe("de");
  });
});
