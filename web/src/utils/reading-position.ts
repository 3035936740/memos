/**
 * Where each long article was left, kept in this browser only, so reopening it can offer to pick up from there.
 * Positions are fractions of the article read, 0 to 1.
 */

const STORAGE_KEY = "memos-reading-positions";
/** The newest positions kept; older ones are dropped. */
const MAX_ENTRIES = 100;

/** Only a position between these is worth offering: before it there is nothing to skip, after it nothing left. */
export const RESUME_MIN = 0.08;
export const RESUME_MAX = 0.92;

type Positions = Record<string, { ratio: number; at: number }>;

const readAll = (): Positions => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Positions) : {};
  } catch {
    return {};
  }
};

export const loadReadingPosition = (memoName: string): number | undefined => {
  const ratio = readAll()[memoName]?.ratio;
  return typeof ratio === "number" && ratio >= RESUME_MIN && ratio <= RESUME_MAX ? ratio : undefined;
};

/** Saves where `memoName` was left; a position outside the resumable range forgets it instead. */
export const saveReadingPosition = (memoName: string, ratio: number, now = Date.now()) => {
  const positions = readAll();
  if (ratio >= RESUME_MIN && ratio <= RESUME_MAX) {
    positions[memoName] = { ratio, at: now };
  } else if (positions[memoName]) {
    delete positions[memoName];
  } else {
    return;
  }
  const kept = Object.entries(positions)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Without storage the article simply opens at the top next time.
  }
};

/** The span of window scroll positions over which `article` is read, from its top under the toolbar to its end. */
export const articleScrollSpan = (article: HTMLElement) => {
  const bounds = article.getBoundingClientRect();
  const toolbarBottom = Math.max(0, document.querySelector<HTMLElement>("[data-app-toolbar]")?.getBoundingClientRect().bottom ?? 0);
  const start = Math.max(0, window.scrollY + bounds.top - toolbarBottom);
  const end = Math.max(start, window.scrollY + bounds.bottom - window.innerHeight);
  return { start, end };
};

/** How far through `article` the window is, 0 to 1. */
export const articleReadRatio = (article: HTMLElement) => {
  const { start, end } = articleScrollSpan(article);
  return end > start ? Math.min(1, Math.max(0, (window.scrollY - start) / (end - start))) : 1;
};
