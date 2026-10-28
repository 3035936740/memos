import dayjs from "dayjs";
import { useSyncExternalStore } from "react";
import { SECRET_BLOG_STYLES } from "./blog-style";
import type { Translations } from "./i18n";
import { REACTIVE_STYLES } from "./style-reactions";

/**
 * A visitor's playthrough of the blog, kept in this browser: reactions discovered for the codex, posts read through,
 * days visited, bosses beaten, shiny cards and glitches seen, and the achievements these unlock.
 */
export interface BlogProgress {
  discovered: string[];
  reads: Record<string, { tags: string[]; style: string; at: number }>;
  visitDays: string[];
  bossKills: number;
  shinies: number;
  glitches: number;
  konami: boolean;
  achievements: string[];
}

const STORAGE_KEY = "memos-blog-progress";
const CHANGE_EVENT = "memos:progress";

const EMPTY_PROGRESS: BlogProgress = {
  discovered: [],
  reads: {},
  visitDays: [],
  bossKills: 0,
  shinies: 0,
  glitches: 0,
  konami: false,
  achievements: [],
};

// One parsed copy shared by every subscriber: useSyncExternalStore needs the same object until something changes.
let cached: BlogProgress | undefined;

const load = (): BlogProgress => {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = raw ? { ...EMPTY_PROGRESS, ...(JSON.parse(raw) as Partial<BlogProgress>) } : { ...EMPTY_PROGRESS };
  } catch {
    cached = { ...EMPTY_PROGRESS };
  }
  return cached;
};

export const getProgress = (): BlogProgress => load();

/** Applies a change, saves it and tells every subscriber. */
export const updateProgress = (change: (progress: BlogProgress) => BlogProgress) => {
  const next = change(load());
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The run still counts for this visit without storage.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
};

export const useBlogProgress = () => useSyncExternalStore(subscribe, getProgress, getProgress);

/** Marks a reaction (or a rare sighting) as found; true the first time. */
export const discover = (id: string): boolean => {
  if (load().discovered.includes(id)) return false;
  updateProgress((progress) => ({ ...progress, discovered: [...progress.discovered, id] }));
  return true;
};

export const recordVisitDay = (date = new Date()) => {
  const day = dayjs(date).format("YYYY-MM-DD");
  if (load().visitDays.includes(day)) return;
  updateProgress((progress) => ({ ...progress, visitDays: [...progress.visitDays, day].slice(-60) }));
};

export const recordRead = (memoName: string, tags: string[], style: string) => {
  if (load().reads[memoName]) return;
  updateProgress((progress) => ({ ...progress, reads: { ...progress.reads, [memoName]: { tags, style, at: Date.now() } } }));
};

export const bumpCounter = (key: "bossKills" | "shinies" | "glitches") =>
  updateProgress((progress) => ({ ...progress, [key]: progress[key] + 1 }));

/** Tags that count as travel posts for the Traveller transformation. */
export const TRAVEL_TAGS = ["旅行", "旅游", "travel", "trip"];

const hasTravelTag = (tags: string[]) => tags.some((tag) => TRAVEL_TAGS.includes(tag.toLowerCase()));

/** The longest run of consecutive days ending today or yesterday. */
export const currentVisitStreak = (visitDays: string[], today = new Date()) => {
  const days = new Set(visitDays);
  let cursor = dayjs(today);
  if (!days.has(cursor.format("YYYY-MM-DD"))) cursor = cursor.subtract(1, "day");
  let streak = 0;
  while (days.has(cursor.format("YYYY-MM-DD"))) {
    streak += 1;
    cursor = cursor.subtract(1, "day");
  }
  return streak;
};

export type Transformation = "traveler" | "regular" | "mastery";

export const MASTERY_READS = 10;

/** Transformations earned so far; mastery is per style, so it reports the styles mastered. */
export const computeTransformations = (progress: BlogProgress) => {
  const reads = Object.values(progress.reads);
  const traveler = reads.filter((read) => hasTravelTag(read.tags)).length >= 3;
  const regular = currentVisitStreak(progress.visitDays) >= 7;
  const readsByStyle = new Map<string, number>();
  for (const read of reads) readsByStyle.set(read.style, (readsByStyle.get(read.style) ?? 0) + 1);
  const masteredStyles = [...readsByStyle.entries()].filter(([, count]) => count >= MASTERY_READS).map(([style]) => style);
  return { traveler, regular, masteredStyles };
};

export const achievementName = (id: string) => `fusion.achievement.${id}.name` as Translations;
export const achievementDescription = (id: string) => `fusion.achievement.${id}.desc` as Translations;

export interface AchievementRule {
  id: string;
  /** Hidden achievements show as "???" until unlocked. */
  hidden?: boolean;
  test: (progress: BlogProgress, legendaryCount: number) => boolean;
}

/** The styles "all flowers" asks for; the secret style comes after the ten legends, so it is not one of them. */
const FLOWER_STYLES = REACTIVE_STYLES.filter((style) => !SECRET_BLOG_STYLES.includes(style));

export const ACHIEVEMENTS: AchievementRule[] = [
  { id: "first-reaction", test: (progress) => progress.discovered.some((id) => id.includes(":")) },
  { id: "first-legend", test: (_, legendary) => legendary >= 1 },
  { id: "five-legends", test: (_, legendary) => legendary >= 5 },
  { id: "all-flowers", test: (progress) => FLOWER_STYLES.every((style) => progress.discovered.includes(`${style}:flower`)) },
  {
    id: "night-reader",
    test: (progress) => Object.values(progress.reads).some((read) => new Date(read.at).getHours() < 5),
  },
  { id: "boss-slayer", test: (progress) => progress.bossKills >= 10 },
  { id: "shiny", test: (progress) => progress.shinies >= 1 },
  { id: "glitch", hidden: true, test: (progress) => progress.glitches >= 1 },
  { id: "konami", hidden: true, test: (progress) => progress.konami },
  { id: "traveler", test: (progress) => computeTransformations(progress).traveler },
  { id: "regular", test: (progress) => computeTransformations(progress).regular },
  { id: "mastery", test: (progress) => computeTransformations(progress).masteredStyles.length > 0 },
  { id: "golden", test: (_, legendary) => legendary >= 10 },
];
