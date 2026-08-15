import { beforeEach, describe, expect, it } from "vitest";
import { applyLocaleEarly, getLocaleWithFallback, loadLocale } from "@/utils/i18n";
import { applyThemeEarly, getThemeWithFallback, loadTheme } from "@/utils/theme";

describe("instance first-visit preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    document.getElementById("instance-theme")?.remove();
  });

  it("uses the configured instance defaults when the browser has no saved preference", () => {
    expect(getLocaleWithFallback(undefined, "fr")).toBe("fr");
    expect(getThemeWithFallback(undefined, "paper")).toBe("paper");
  });

  it("keeps an existing browser preference ahead of the instance default", () => {
    loadLocale("zh-Hant");
    loadTheme("default-dark");

    expect(getLocaleWithFallback(undefined, "fr")).toBe("zh-Hant");
    expect(getThemeWithFallback(undefined, "paper")).toBe("default-dark");
  });

  it("does not persist the temporary early fallback before instance settings load", () => {
    applyLocaleEarly();
    applyThemeEarly();

    expect(localStorage.getItem("memos-locale")).toBeNull();
    expect(localStorage.getItem("memos-theme")).toBeNull();
  });

  it("loads and persists the Twilight theme", () => {
    loadTheme("twilight-dark");

    expect(document.documentElement.dataset.theme).toBe("twilight-dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("memos-theme")).toBe("twilight-dark");
    expect(getThemeWithFallback()).toBe("twilight-dark");
  });
});
