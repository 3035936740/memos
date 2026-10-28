import { describe, expect, it } from "vitest";
import { notableRevision, outdatedYears } from "@/utils/memo-age";

const now = new Date(2026, 9, 28);

describe("outdatedYears", () => {
  it("counts whole years once a post is a year old", () => {
    expect(outdatedYears(new Date(2026, 3, 1), [], now)).toBeUndefined();
    expect(outdatedYears(new Date(2025, 9, 1), [], now)).toBe(1);
    expect(outdatedYears(new Date(2023, 6, 1), [], now)).toBe(3);
    expect(outdatedYears(undefined, [], now)).toBeUndefined();
  });

  it("leaves evergreen posts alone", () => {
    expect(outdatedYears(new Date(2020, 0, 1), ["长期有效"], now)).toBeUndefined();
    expect(outdatedYears(new Date(2020, 0, 1), ["Evergreen"], now)).toBeUndefined();
  });
});

describe("notableRevision", () => {
  it("names only an edit made well after writing", () => {
    const written = new Date(2024, 0, 1);
    expect(notableRevision(written, new Date(2024, 0, 5))).toBeUndefined();
    expect(notableRevision(written, new Date(2025, 2, 1))).toEqual(new Date(2025, 2, 1));
  });
});
