import { describe, expect, it } from "vitest";
import {
  buildAppearancePack,
  externalHostsOf,
  isPoweredByHidden,
  parseAppearancePack,
  setPoweredByHidden,
} from "@/utils/appearance-pack";

const appearance = {
  firstVisitDefaultStyle: "pixel",
  firstVisitDefaultTheme: "cosmic-dark",
  defaultBackgroundImageUrl: "https://img.example.net/bg.png",
  additionalStyle: '@import url("https://fonts.example.com/a.css");\nbody { background: url(/local.png); }',
};

describe("appearance packs", () => {
  it("round-trips a look and keeps the site's own powered-by choice out of it", () => {
    const hidden = { ...appearance, additionalStyle: setPoweredByHidden(appearance.additionalStyle, true) };
    expect(isPoweredByHidden(hidden.additionalStyle)).toBe(true);
    const pack = buildAppearancePack(hidden, "Night pixels", new Date("2026-10-28T00:00:00Z"));
    expect(isPoweredByHidden(pack.appearance.additionalStyle)).toBe(false);

    const result = parseAppearancePack(JSON.stringify(pack));
    expect("pack" in result && result.pack.appearance).toEqual({ ...appearance });
  });

  it("refuses other files, newer versions and oversized CSS, and drops unknown styles", () => {
    expect(parseAppearancePack("not json")).toEqual({ error: "invalid" });
    expect(parseAppearancePack(JSON.stringify({ kind: "other" }))).toEqual({ error: "invalid" });
    const pack = buildAppearancePack(appearance, "x");
    expect(parseAppearancePack(JSON.stringify({ ...pack, version: 99 }))).toEqual({ error: "version" });
    const huge = { ...pack, appearance: { ...pack.appearance, additionalStyle: "a".repeat(200_001) } };
    expect(parseAppearancePack(JSON.stringify(huge))).toEqual({ error: "too-large" });
    const odd = { ...pack, appearance: { ...pack.appearance, firstVisitDefaultStyle: "golden-ish", additionalScript: "alert(1)" } };
    const result = parseAppearancePack(JSON.stringify(odd));
    expect("pack" in result && result.pack.appearance.firstVisitDefaultStyle).toBe("");
    expect("pack" in result && "additionalScript" in result.pack.appearance).toBe(false);
  });

  it("lists the other sites a pack would load files from", () => {
    expect(externalHostsOf(appearance)).toEqual(["img.example.net", "fonts.example.com"]);
  });

  it("adds and removes the powered-by rule without touching the rest", () => {
    const css = "a { color: red; }";
    const hidden = setPoweredByHidden(css, true);
    expect(hidden).toContain("[data-powered-by]");
    expect(setPoweredByHidden(hidden, false)).toBe(css);
    expect(setPoweredByHidden(setPoweredByHidden("", true), false)).toBe("");
  });
});
