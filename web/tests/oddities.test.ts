import { afterEach, describe, expect, it } from "vitest";
import {
  bumpTimeMachineVisits,
  bumpVoidCount,
  counterDigits,
  ERA_STYLES,
  ERAS,
  isEra,
  readVoidCount,
  scatter,
  TEAPOT_POUR_AT,
  teapotAnswer,
  voidEffectFor,
  voidMilestone,
} from "@/utils/oddities";

describe("the odd pages", () => {
  afterEach(() => localStorage.clear());

  it("lets every style destroy a thought its own way", () => {
    expect(voidEffectFor("terminal")).toBe("rm");
    expect(voidEffectFor("pixel")).toBe("blocks");
    expect(voidEffectFor("handdrawn")).toBe("erase");
    expect(voidEffectFor("vaporwave")).toBe("melt");
    expect(voidEffectFor(undefined)).toBe("dissolve");
  });

  it("counts only how many thoughts were let go", () => {
    expect(readVoidCount()).toBe(0);
    expect(bumpVoidCount()).toBe(1);
    expect(bumpVoidCount()).toBe(2);
    expect(readVoidCount()).toBe(2);
    expect(voidMilestone(1)).toBe(1);
    expect(voidMilestone(2)).toBeUndefined();
    expect(voidMilestone(100)).toBe(100);
  });

  it("scatters letters the same way every time", () => {
    expect(scatter(3, 7)).toBe(scatter(3, 7));
    for (let index = 0; index < 50; index += 1) {
      const value = scatter(index, 11);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("has the teapot refuse until the eighteenth try", () => {
    expect(teapotAnswer(1)).toBe(1);
    expect(teapotAnswer(TEAPOT_POUR_AT - 1)).toBe(17);
    expect(teapotAnswer(TEAPOT_POUR_AT)).toBe("pour");
    expect(teapotAnswer(40)).toBe("pour");
  });

  it("knows its eras and their styles", () => {
    expect(ERAS).toEqual(["1985", "1999", "2009", "2049"]);
    expect(isEra("1999")).toBe(true);
    expect(isEra("2000")).toBe(false);
    expect(isEra(null)).toBe(false);
    expect(ERA_STYLES["1999"]).toBe("y2k");
  });

  it("keeps a 1999 visitor counter", () => {
    expect(bumpTimeMachineVisits()).toBe(1);
    expect(bumpTimeMachineVisits()).toBe(2);
    expect(counterDigits(42)).toEqual(["0", "0", "0", "0", "4", "2"]);
    expect(counterDigits(1234567, 6)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });
});
