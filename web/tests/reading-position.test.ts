import { beforeEach, describe, expect, it } from "vitest";
import { loadReadingPosition, saveReadingPosition } from "@/utils/reading-position";

describe("reading positions", () => {
  beforeEach(() => localStorage.clear());

  it("keeps a place worth returning to and forgets one at either end", () => {
    saveReadingPosition("memos/a", 0.4);
    expect(loadReadingPosition("memos/a")).toBe(0.4);

    saveReadingPosition("memos/a", 0.99);
    expect(loadReadingPosition("memos/a")).toBeUndefined();

    saveReadingPosition("memos/b", 0.02);
    expect(loadReadingPosition("memos/b")).toBeUndefined();
  });

  it("keeps only the newest hundred articles", () => {
    for (let index = 0; index < 105; index++) saveReadingPosition(`memos/${index}`, 0.5, index);
    expect(loadReadingPosition("memos/0")).toBeUndefined();
    expect(loadReadingPosition("memos/104")).toBe(0.5);
  });
});
