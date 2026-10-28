import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyEffectsAttribute,
  EFFECTS_CHANGE_EVENT,
  isLiteEffects,
  isMotionReduced,
  looksLowPowered,
  readEffectsMode,
  reducedMotionQuery,
  setEffectsMode,
} from "@/utils/effects";

describe("low-power effects", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete document.documentElement.dataset.effects;
    vi.unstubAllGlobals();
  });

  it("spots devices that report little memory or ask to save data", () => {
    expect(looksLowPowered({ deviceMemory: 0.5 })).toBe(true);
    expect(looksLowPowered({ deviceMemory: 2 })).toBe(true);
    expect(looksLowPowered({ deviceMemory: 8 })).toBe(false);
    expect(looksLowPowered({ connection: { saveData: true } })).toBe(true);
    expect(looksLowPowered({})).toBe(false);
  });

  it("follows the visitor's choice and remembers it in this browser", () => {
    expect(readEffectsMode()).toBe("auto");
    setEffectsMode("lite");
    expect(readEffectsMode()).toBe("lite");
    expect(isLiteEffects()).toBe(true);
    expect(document.documentElement.dataset.effects).toBe("lite");

    setEffectsMode("full");
    expect(isLiteEffects()).toBe(false);
    expect(document.documentElement.dataset.effects).toBeUndefined();
  });

  it("turns on in auto once the frame-rate check found the device slow", () => {
    expect(isLiteEffects("auto")).toBe(false);
    sessionStorage.setItem("memos-plus-effects-slow", "1");
    expect(isLiteEffects("auto")).toBe(true);
    expect(isLiteEffects("full")).toBe(false);
    applyEffectsAttribute();
    expect(document.documentElement.dataset.effects).toBe("lite");
  });

  it("never brings back motion the system asked to reduce", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    setEffectsMode("full");
    expect(isMotionReduced()).toBe(true);
  });

  it("tells motion listeners when the mode changes", () => {
    const query = reducedMotionQuery();
    const listener = vi.fn();
    query.addEventListener("change", listener);
    expect(query.matches).toBe(false);

    setEffectsMode("lite");
    expect(listener).toHaveBeenCalledOnce();
    expect(query.matches).toBe(true);

    query.removeEventListener("change", listener);
    window.dispatchEvent(new Event(EFFECTS_CHANGE_EVENT));
    expect(listener).toHaveBeenCalledOnce();
  });
});
