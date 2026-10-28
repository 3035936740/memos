import { afterEach, describe, expect, it } from "vitest";
import { dayKey, hideTodayCard, isTodayCardHidden, sameDayInPastYears, writingStreak } from "@/utils/home-today";

const at = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour);

describe("today's card", () => {
  afterEach(() => localStorage.clear());

  it("counts a streak ending today, or yesterday when today is still blank", () => {
    const today = at(2026, 10, 28);
    const written = [at(2026, 10, 28, 9), at(2026, 10, 28, 21), at(2026, 10, 27), at(2026, 10, 26), at(2026, 10, 24)];
    expect(writingStreak(written, today)).toEqual({ days: 3, wroteToday: true, todayCount: 2 });
    expect(writingStreak(written.slice(2), today)).toEqual({ days: 2, wroteToday: false, todayCount: 0 });
    expect(writingStreak([at(2026, 10, 20)], today)).toEqual({ days: 0, wroteToday: false, todayCount: 0 });
  });

  it("finds this day in past years, newest first", () => {
    const today = at(2026, 10, 28);
    const written = [at(2024, 10, 28), at(2025, 10, 28), at(2025, 10, 28, 20), at(2025, 10, 27), at(2026, 10, 28)];
    expect(sameDayInPastYears(written, today)).toEqual([
      { year: 2025, count: 2, key: "2025-10-28" },
      { year: 2024, count: 1, key: "2024-10-28" },
    ]);
  });

  it("writes local days as the calendar filter expects", () => {
    expect(dayKey(at(2026, 3, 5))).toBe("2026-03-05");
  });

  it("stays put away for the rest of the day only", () => {
    hideTodayCard(at(2026, 10, 28));
    expect(isTodayCardHidden(at(2026, 10, 28, 23))).toBe(true);
    expect(isTodayCardHidden(at(2026, 10, 29))).toBe(false);
  });
});
