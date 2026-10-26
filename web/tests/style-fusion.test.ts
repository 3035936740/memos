import { describe, expect, it } from "vitest";
import {
  isPlayableTrack,
  keepInstanceSiteConfig,
  parseInstancePages,
  parseInstanceSiteConfig,
  resolveMusicConfig,
  withInstanceSiteConfig,
} from "@/lib/instance-content";
import { type BlogProgress, computeTransformations, currentVisitStreak } from "@/utils/blog-progress";
import { estimateReadingMinutes } from "@/utils/reading-time";
import { computeFusion, getDaypart, getFestival, THEME_ELEMENTS } from "@/utils/style-reactions";
import { tagItemsOf } from "@/utils/tag-items";

const emptyProgress: BlogProgress = {
  discovered: [],
  reads: {},
  visitDays: [],
  bossKills: 0,
  shinies: 0,
  glitches: 0,
  konami: false,
  achievements: [],
};

describe("computeFusion", () => {
  it("keeps plain styles and the stock themes in their own palette", () => {
    expect(computeFusion("glass", "cosmic-dark")).toMatchObject({ pure: true, reactionIds: [] });
    expect(computeFusion("pixel", "default").pure).toBe(true);
    expect(computeFusion("pixel", "default-dark").pure).toBe(true);
    expect(computeFusion(undefined, "matcha").pure).toBe(true);
  });

  it("fuses a reactive style with a colour theme and lists its element reactions", () => {
    const fusion = computeFusion("aero", "matcha");
    expect(fusion.pure).toBe(false);
    expect(fusion.elements).toEqual(["nature"]);
    expect(fusion.reactionIds).toEqual(["aero:nature"]);
    expect(fusion.legendary).toBeUndefined();
  });

  it("puts a legendary reaction first", () => {
    const fusion = computeFusion("terminal", "neon-rain-dark");
    expect(fusion.legendary?.id).toBe("matrix");
    expect(fusion.reactionIds).toEqual(["matrix", "terminal:rain", "terminal:night"]);
  });

  it("gives every colour theme at least one element", () => {
    for (const [theme, elements] of Object.entries(THEME_ELEMENTS)) {
      expect(elements.length, theme).toBeGreaterThan(0);
    }
  });
});

describe("dayparts and festivals", () => {
  it("names the part of the day", () => {
    expect(getDaypart(new Date(2026, 0, 1, 2))).toBe("midnight");
    expect(getDaypart(new Date(2026, 0, 1, 6))).toBe("dawn");
    expect(getDaypart(new Date(2026, 0, 1, 12))).toBe("day");
    expect(getDaypart(new Date(2026, 0, 1, 19))).toBe("dusk");
    expect(getDaypart(new Date(2026, 0, 1, 21))).toBe("night");
  });

  it("finds the festival season", () => {
    expect(getFestival(new Date(2026, 1, 17))).toBe("spring");
    expect(getFestival(new Date(2026, 9, 28))).toBe("halloween");
    expect(getFestival(new Date(2026, 11, 20))).toBe("winter");
    expect(getFestival(new Date(2026, 6, 1))).toBeUndefined();
  });
});

describe("blog progress", () => {
  it("counts the visit streak ending today or yesterday", () => {
    const today = new Date(2026, 9, 26);
    expect(currentVisitStreak(["2026-10-24", "2026-10-25", "2026-10-26"], today)).toBe(3);
    expect(currentVisitStreak(["2026-10-24", "2026-10-25"], today)).toBe(2);
    expect(currentVisitStreak(["2026-10-20"], today)).toBe(0);
  });

  it("earns the traveller and mastery transformations", () => {
    const reads: BlogProgress["reads"] = {};
    for (let index = 0; index < 10; index++) {
      reads[`memos/${index}`] = { tags: index < 3 ? ["旅行"] : [], style: "pixel", at: 0 };
    }
    const result = computeTransformations({ ...emptyProgress, reads });
    expect(result.traveler).toBe(true);
    expect(result.masteredStyles).toEqual(["pixel"]);
    expect(computeTransformations(emptyProgress)).toEqual({ traveler: false, regular: false, masteredStyles: [] });
  });
});

describe("tag items and reading time", () => {
  it("turns tags into items whatever their case", () => {
    expect(tagItemsOf(["旅行", "Cat", "下雨"])).toEqual(["rain", "cat", "travel"]);
    expect(tagItemsOf(["notes"])).toEqual([]);
  });

  it("estimates whole minutes and never less than one", () => {
    expect(estimateReadingMinutes("")).toBe(1);
    expect(estimateReadingMinutes("字".repeat(800))).toBe(2);
    expect(estimateReadingMinutes("word ".repeat(440))).toBe(2);
  });
});

describe("site config in custom pages", () => {
  const pagesJson = JSON.stringify([{ slug: "about", title: "About", markdown: "# Hi", access: "public" }]);

  it("stores the config as a hidden entry that page readers skip", () => {
    const withConfig = withInstanceSiteConfig(pagesJson, { firstVisitStyle: "pixel" });
    expect(parseInstancePages(withConfig).map((page) => page.slug)).toEqual(["about"]);
    expect(parseInstanceSiteConfig(withConfig)).toEqual({ firstVisitStyle: "pixel" });
  });

  it("keeps the config when the pages are rewritten", () => {
    const withConfig = withInstanceSiteConfig(pagesJson, { firstVisitStyle: "aero" });
    const rewritten = JSON.stringify([{ slug: "now", title: "Now", markdown: "", access: "public" }]);
    const kept = keepInstanceSiteConfig(rewritten, withConfig);
    expect(parseInstancePages(kept).map((page) => page.slug)).toEqual(["now"]);
    expect(parseInstanceSiteConfig(kept)).toEqual({ firstVisitStyle: "aero" });
  });

  it("fills in music defaults and keeps tracks still waiting for a link", () => {
    const music = resolveMusicConfig({
      music: { enabled: true, autoplay: false, defaultMuted: false, mode: "reverse", tracks: [{ id: "a", title: "A", url: "" }] },
    });
    expect(music).toMatchObject({ enabled: true, autoplay: false, defaultMuted: false, mode: "reverse" });
    expect(music.tracks.map((track) => track.id)).toEqual(["a"]);
    expect(music.tracks.filter(isPlayableTrack)).toEqual([]);
    expect(resolveMusicConfig({})).toMatchObject({ enabled: false, autoplay: true, defaultMuted: true, mode: "random" });
  });
});
