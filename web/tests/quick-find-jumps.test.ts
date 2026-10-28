import { describe, expect, it } from "vitest";
import { matchesQuery, memoLookupFilter } from "@/components/AppSidebar/useQuickFindJumps";

describe("quick find jumps", () => {
  it("matches any of the texts, ignoring case and surrounding spaces", () => {
    expect(matchesQuery(" Set ", "Settings", "/setting")).toBe(true);
    expect(matchesQuery("设置", "设置", "/setting")).toBe(true);
    expect(matchesQuery("inbox", "Settings")).toBe(false);
    expect(matchesQuery("  ", "Settings")).toBe(false);
  });

  it("quotes the query for the content filter", () => {
    expect(memoLookupFilter(' say "hi" ')).toBe('content.contains("say \\"hi\\"")');
  });
});
