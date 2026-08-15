import { describe, expect, it } from "vitest";
import { getMemoPaginationItems } from "@/components/PagedMemoList/MemoPagination";

describe("getMemoPaginationItems", () => {
  it("shows every page when the list is short", () => {
    expect(getMemoPaginationItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the first and last pages visible near the beginning", () => {
    expect(getMemoPaginationItems(2, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 9, 10]);
  });

  it("centers the window around a middle page", () => {
    expect(getMemoPaginationItems(8, 20)).toEqual([1, "ellipsis-start", 7, 8, 9, "ellipsis-end", 20]);
  });
});
