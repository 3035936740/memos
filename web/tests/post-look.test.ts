import { describe, expect, it } from "vitest";
import { postLookOf, TAGGABLE_STYLES, THEME_TAG_NAMES } from "@/utils/post-look";

describe("postLookOf", () => {
  it("reads a style and a theme from the post's tags", () => {
    expect(postLookOf(["travel", "style/vaporwave", "theme/neon-rain"])).toEqual({ style: "vaporwave", theme: "neon-rain-dark" });
  });

  it("accepts full theme ids and ignores case", () => {
    expect(postLookOf(["Style/Pixel", "THEME/neon-rain-dark"])).toEqual({ style: "pixel", theme: "neon-rain-dark" });
    expect(postLookOf(["theme/light"]).theme).toBe("default");
    expect(postLookOf(["theme/dark"]).theme).toBe("default-dark");
  });

  it("ignores unknown names, secret styles and the system theme", () => {
    expect(postLookOf(["style/comic-sans", "theme/rainbow"])).toEqual({ style: undefined, theme: undefined });
    expect(postLookOf(["style/golden"]).style).toBeUndefined();
    expect(postLookOf(["theme/system"]).theme).toBeUndefined();
    expect(postLookOf(["style/"])).toEqual({ style: undefined, theme: undefined });
  });

  it("takes the first tag of each kind", () => {
    expect(postLookOf(["style/glass", "style/pixel"]).style).toBe("glass");
  });

  it("lists every taggable style and theme name", () => {
    expect(TAGGABLE_STYLES).not.toContain("golden");
    expect(TAGGABLE_STYLES).toContain("default");
    expect(THEME_TAG_NAMES.get("sakura-night")).toBe("sakura-night-dark");
    expect(THEME_TAG_NAMES.has("system")).toBe(false);
  });
});
