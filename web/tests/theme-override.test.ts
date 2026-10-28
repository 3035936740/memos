import { afterEach, describe, expect, it } from "vitest";
import { chooseTheme, loadTheme, setColorSchemeConstraint, setThemeOverride, THEME_CHOSEN_EVENT } from "@/utils/theme";

const shownTheme = () => document.documentElement.dataset.theme;

describe("setThemeOverride", () => {
  afterEach(() => {
    setThemeOverride(undefined);
    setColorSchemeConstraint(undefined);
    localStorage.clear();
  });

  it("shows a post's theme over the visitor's and gives theirs back afterwards", () => {
    loadTheme("paper");
    setThemeOverride("neon-rain-dark");
    expect(shownTheme()).toBe("neon-rain-dark");

    // The visitor's own preference still updates and saves underneath.
    loadTheme("matcha");
    expect(shownTheme()).toBe("neon-rain-dark");
    expect(localStorage.getItem("memos-theme")).toBe("matcha");

    setThemeOverride(undefined);
    expect(shownTheme()).toBe("matcha");
  });

  it("keeps to the one scheme a style pack is drawn for", () => {
    loadTheme("editorial");
    setColorSchemeConstraint("dark");
    expect(shownTheme()).toBe("editorial-dark");

    // A theme without a dark counterpart gives way to default's.
    loadTheme("paper");
    expect(shownTheme()).toBe("default-dark");
    expect(localStorage.getItem("memos-theme")).toBe("paper");

    // A theme already in the scheme stays.
    loadTheme("neon-rain-dark");
    expect(shownTheme()).toBe("neon-rain-dark");

    setColorSchemeConstraint("light");
    expect(shownTheme()).toBe("default");

    setColorSchemeConstraint(undefined);
    expect(shownTheme()).toBe("neon-rain-dark");
  });

  it("announces a theme picked by hand", () => {
    let announced = 0;
    const listener = () => {
      announced += 1;
    };
    window.addEventListener(THEME_CHOSEN_EVENT, listener);
    chooseTheme("lavender");
    window.removeEventListener(THEME_CHOSEN_EVENT, listener);

    expect(announced).toBe(1);
    expect(shownTheme()).toBe("lavender");
  });
});
