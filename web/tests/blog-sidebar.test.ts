import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { deriveBlogSidebarStats } from "@/components/BlogSidebar";
import type { UserStats } from "@/types/proto/api/v1/user_service_pb";

describe("deriveBlogSidebarStats", () => {
  it("aggregates article, comment, running-day, and last-activity values", () => {
    const stats = [
      {
        totalMemoCount: 3,
        totalCommentCount: 5,
        memoCreatedTimestamps: [timestampFromDate(new Date("2026-08-10T00:00:00Z"))],
        memoUpdatedTimestamps: [timestampFromDate(new Date("2026-08-14T12:00:00Z"))],
      },
      {
        totalMemoCount: 2,
        totalCommentCount: 1,
        memoCreatedTimestamps: [timestampFromDate(new Date("2026-08-12T00:00:00Z"))],
        memoUpdatedTimestamps: [timestampFromDate(new Date("2026-08-15T08:00:00Z"))],
      },
    ] as UserStats[];

    const result = deriveBlogSidebarStats(stats, new Date("2026-08-15T12:00:00Z"));

    expect(result.articleCount).toBe(5);
    expect(result.commentCount).toBe(6);
    expect(result.runningDays).toBe(6);
    expect(result.lastActiveAt?.toISOString()).toBe("2026-08-15T08:00:00.000Z");
  });
});
