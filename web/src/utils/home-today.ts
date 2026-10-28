/**
 * Today's card at the top of Home: the writing streak and the same day in past years. Dates are the visitor's
 * local days, the same ones the calendar filter uses.
 */

const pad = (value: number) => String(value).padStart(2, "0");

/** A local day as YYYY-MM-DD, the value the displayTime filter takes. */
export const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const dayBefore = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);

export interface WritingStreak {
  /** Days in a row with at least one memo, ending today or, if nothing is written yet today, yesterday. */
  days: number;
  wroteToday: boolean;
  todayCount: number;
}

export const writingStreak = (created: readonly Date[], today: Date): WritingStreak => {
  const counts = new Map<string, number>();
  for (const date of created) counts.set(dayKey(date), (counts.get(dayKey(date)) ?? 0) + 1);
  const todayCount = counts.get(dayKey(today)) ?? 0;
  let day = todayCount > 0 ? today : dayBefore(today);
  let days = 0;
  while (counts.has(dayKey(day))) {
    days += 1;
    day = dayBefore(day);
  }
  return { days, wroteToday: todayCount > 0, todayCount };
};

export interface PastDay {
  year: number;
  count: number;
  /** The day to filter the list to. */
  key: string;
}

/** Memos written on today's month and day in earlier years, newest year first. */
export const sameDayInPastYears = (created: readonly Date[], today: Date): PastDay[] => {
  const byYear = new Map<number, number>();
  for (const date of created) {
    if (date.getMonth() === today.getMonth() && date.getDate() === today.getDate() && date.getFullYear() < today.getFullYear()) {
      byYear.set(date.getFullYear(), (byYear.get(date.getFullYear()) ?? 0) + 1);
    }
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, count]) => ({ year, count, key: `${year}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` }));
};

const HIDDEN_KEY = "memos-plus-today-hidden";

/** Whether the visitor put today's card away for the rest of the day. */
export const isTodayCardHidden = (today: Date) => {
  try {
    return localStorage.getItem(HIDDEN_KEY) === dayKey(today);
  } catch {
    return false;
  }
};

export const hideTodayCard = (today: Date) => {
  try {
    localStorage.setItem(HIDDEN_KEY, dayKey(today));
  } catch {
    // Not remembered; it shows again on the next visit.
  }
};
