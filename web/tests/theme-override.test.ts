import { afterEach, describe, expect, it } from "vitest";
import { chooseTheme, loadTheme, setThemeOverride, THEME_CHOSEN_EVENT } from "@/utils/theme";

const shownTheme = () => document.documentElement.dataset.theme;

describe("setThemeOverride", () => {
  afterEach(() => {
    setThemeOverride(undefined);
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
