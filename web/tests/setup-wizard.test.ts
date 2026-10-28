import { beforeEach, describe, expect, it } from "vitest";
import { isSetupDone, looksUnconfigured, markSetupDone, SITE_PRESETS } from "@/utils/setup-wizard";

describe("setup wizard", () => {
  beforeEach(() => localStorage.clear());

  it("offers itself only to a site nobody has set up", () => {
    expect(looksUnconfigured({ firstVisitDefaultStyle: "", firstVisitDefaultTheme: "" })).toBe(true);
    expect(looksUnconfigured({ customProfile: { title: "My site" }, firstVisitDefaultStyle: "", firstVisitDefaultTheme: "" })).toBe(false);
    expect(looksUnconfigured({ firstVisitDefaultStyle: "pixel", firstVisitDefaultTheme: "" })).toBe(false);
  });

  it("remembers being dismissed or finished", () => {
    expect(isSetupDone()).toBe(false);
    markSetupDone();
    expect(isSetupDone()).toBe(true);
  });

  it("keeps a community closed to strangers' eyes by default", () => {
    expect(SITE_PRESETS.community).toMatchObject({ disallowUserRegistration: false, defaultMemberMemoVisibility: "PROTECTED" });
    expect(SITE_PRESETS.blog.disallowUserRegistration).toBe(true);
  });
});
