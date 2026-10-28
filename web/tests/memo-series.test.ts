import { describe, expect, it } from "vitest";
import { seriesFilterOf, seriesNameOf, seriesTagOf, seriesWindow } from "@/utils/memo-series";

describe("memo series", () => {
  it("finds the series tag, its name and its filter", () => {
    expect(seriesTagOf(["日记", "系列/Go入门"])).toBe("系列/Go入门");
    expect(seriesTagOf(["Series/Rust"])).toBe("Series/Rust");
    expect(seriesTagOf(["系列/", "系列"])).toBeUndefined();
    expect(seriesNameOf("系列/Go入门")).toBe("Go入门");
    expect(seriesFilterOf('系列/"q"')).toBe('tag in ["系列/\\"q\\""]');
  });

  it("keeps the current post in the middle of a collapsed list", () => {
    expect(seriesWindow(3, 1, 5)).toEqual([0, 3]);
    expect(seriesWindow(10, 0, 5)).toEqual([0, 5]);
    expect(seriesWindow(10, 5, 5)).toEqual([3, 8]);
    expect(seriesWindow(10, 9, 5)).toEqual([5, 10]);
  });
});
