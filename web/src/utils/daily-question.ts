import { cacheService } from "@/components/MemoEditor/services/cacheService";
import supportedLocaleCodes from "@/locale-codes.json";

/**
 * The daily question (backend-daily-question.md). Each site has its own seed; the year and the seed shuffle the
 * question list into that year's order, so every day of a year gets a different question, the next year a new
 * order, and two sites rarely share a day's question. The 366th day of a leap year draws one at random.
 */

/** FNV-1a over the UTF-8 bytes: a stable 32-bit number for a string. */
export const hashText = (text: string) => {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** mulberry32: a small seeded generator of numbers in [0, 1). */
export const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** The order a year shows `count` questions in: a Fisher–Yates shuffle of 0 … count - 1. */
export const yearOrder = (count: number, year: number, seed: string, round = 0) => {
  const order = Array.from({ length: count }, (_, index) => index);
  const random = seededRandom(hashText(round === 0 ? `${year}:${seed}` : `${year}:${seed}:round:${round}`));
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

/** The local day of the year, 1 for 1 January. */
export const dayOfYear = (date: Date) =>
  Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 86_400_000) + 1;

/** Which question (an index into a list of `count`) belongs to `date` on a site with `seed`. */
export const questionIndexFor = (date: Date, count: number, seed: string) => {
  if (count <= 0) return undefined;
  const year = date.getFullYear();
  const day = dayOfYear(date);
  // Exhaust each shuffled round before starting a newly shuffled one.
  const round = day <= 365 ? Math.floor((day - 1) / count) : 0;
  const order = yearOrder(count, year, seed, round);
  if (day <= 365) return order[(day - 1) % count];
  return order[Math.floor(seededRandom(hashText(`${year}:${seed}:366`))() * count)];
};

export interface DailyQuestionSettings {
  /** The site's seed; empty until the server has made one. */
  seed: string;
  /** The administrator's own questions, or undefined for the built-in ones. */
  questions?: DailyQuestionEntry[];
  disabled: boolean;
}

/**
 * Reads the three daily question fields from the general setting. They arrive with the backend change in
 * backend-daily-question.md; until then the site's address stands in for the seed so sites still differ.
 */
export const readDailyQuestionSettings = (setting: object): DailyQuestionSettings => {
  const raw = setting as { dailyQuestionSeed?: string; dailyQuestionsJson?: string; disableDailyQuestion?: boolean };
  let questions: DailyQuestionEntry[] | undefined;
  try {
    const parsed: unknown = raw.dailyQuestionsJson ? JSON.parse(raw.dailyQuestionsJson) : undefined;
    if (Array.isArray(parsed)) {
      const kept = parsed.filter(isDailyQuestionEntry).map((item) => (typeof item === "string" ? item.trim() : item));
      questions = kept.length > 0 ? kept : undefined;
    }
  } catch {
    // Unreadable custom questions fall back to the built-in ones.
  }
  return { seed: raw.dailyQuestionSeed || window.location.host || "memos-plus", questions, disabled: raw.disableDailyQuestion === true };
};

export type BankLanguage = "zh-Hans" | "zh-Hant" | "en";
export const BUILTIN_QUESTION_LANGUAGES: BankLanguage[] = ["en", "zh-Hans", "zh-Hant"];
export const QUESTION_LANGUAGES: readonly string[] = supportedLocaleCodes;
export const BUILTIN_QUESTION_COUNT = 365;
export const MAX_DAILY_QUESTIONS = 2000;
export const MAX_QUESTION_CHARACTERS = 200;
export type CustomDailyQuestion = {
  text: string;
  /** Empty means common text without a declared language. */
  locale?: string;
  translations?: Record<string, string>;
};
export type DailyQuestionEntry = string | { builtin: number } | CustomDailyQuestion;
export type QuestionBanks = Record<BankLanguage, readonly string[]>;
export const isBuiltinQuestion = (entry: DailyQuestionEntry): entry is { builtin: number } =>
  typeof entry === "object" && "builtin" in entry;
export const isDailyQuestionEntry = (entry: unknown): entry is DailyQuestionEntry => {
  if (typeof entry === "string") return entry.trim().length > 0;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const item = entry as Record<string, unknown>;
  if ("builtin" in item)
    return (
      Number.isInteger(item.builtin) &&
      Number(item.builtin) >= 0 &&
      Number(item.builtin) < BUILTIN_QUESTION_COUNT &&
      Object.keys(item).length === 1
    );
  if (typeof item.text !== "string" || !item.text.trim()) return false;
  if (item.locale !== undefined && (typeof item.locale !== "string" || (item.locale !== "" && !QUESTION_LANGUAGES.includes(item.locale))))
    return false;
  if (item.translations !== undefined && (!item.translations || typeof item.translations !== "object" || Array.isArray(item.translations)))
    return false;
  return (
    Object.keys(item).every((key) => ["text", "locale", "translations"].includes(key)) &&
    Object.entries((item.translations ?? {}) as Record<string, unknown>).every(
      ([locale, text]) => QUESTION_LANGUAGES.includes(locale) && typeof text === "string",
    )
  );
};

export const resolveDailyQuestion = (entry: DailyQuestionEntry, language: string, builtIn?: readonly string[]) => {
  if (typeof entry === "string") return entry;
  if (isBuiltinQuestion(entry)) return builtIn?.[entry.builtin];
  const normalized = language.replaceAll("_", "-").toLowerCase();
  const requested = normalized.startsWith("zh")
    ? bankLanguageFor(normalized)
    : QUESTION_LANGUAGES.find((locale) => locale.toLowerCase() === normalized);
  const parent = normalized.split("-")[0];
  for (const locale of new Set([requested, parent, "en"])) {
    if (!locale) continue;
    const text = entry.locale === locale ? entry.text : entry.translations?.[locale];
    if (text?.trim()) return text.trim();
  }
  // Keep legacy/common questions usable when their author has not supplied English yet.
  return entry.text;
};

export const dailyQuestionBankIssue = (raw: string): "invalid" | "too-many" | "too-long" | "too-large" | undefined => {
  if (!raw.trim()) return undefined;
  if (new TextEncoder().encode(raw).length > 256 * 1024) return "too-large";
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length === 0 || !values.every(isDailyQuestionEntry)) return "invalid";
    if (values.length > MAX_DAILY_QUESTIONS) return "too-many";
    for (const entry of values) {
      if (isBuiltinQuestion(entry)) continue;
      const texts = typeof entry === "string" ? [entry] : [entry.text, ...Object.values(entry.translations ?? {})];
      if (texts.some((text) => [...text.trim()].length > MAX_QUESTION_CHARACTERS)) return "too-long";
    }
  } catch {
    return "invalid";
  }
  return undefined;
};

/** All three banks are loaded together only by the administrator's editor. */
export const loadAllQuestionBanks = async (): Promise<QuestionBanks> => {
  const [en, simplified, traditional] = await Promise.all(BUILTIN_QUESTION_LANGUAGES.map(loadBuiltInQuestions));
  return { en, "zh-Hans": simplified, "zh-Hant": traditional };
};

/** The built-in bank that suits a UI language: Traditional for zh-Hant / TW / HK, Simplified for other Chinese, else English. */
export const bankLanguageFor = (language: string): BankLanguage => {
  const lower = language.toLowerCase();
  if (/^zh-(hant|tw|hk|mo)/.test(lower)) return "zh-Hant";
  if (lower.startsWith("zh")) return "zh-Hans";
  return "en";
};

const BANKS: Record<BankLanguage, () => Promise<{ default: readonly string[] }>> = {
  "zh-Hans": () => import("./daily-questions/zh-Hans"),
  "zh-Hant": () => import("./daily-questions/zh-Hant"),
  en: () => import("./daily-questions/en"),
};

/** Loads a built-in bank on demand, so only the reader's language is downloaded. */
export const loadBuiltInQuestions = async (language: string) => (await BANKS[bankLanguageFor(language)]()).default;

/** The tag that gathers a day's answers; English like the style tags, so it reads the same on every site. */
export const dailyQuestionTag = (dayKey: string) => `daily/${dayKey}`;

/**
 * Starts an answer in the draft of the editor with `cacheKey`: the question quoted, room to write, the day's tag at
 * the end, and the cursor in the room. Anything already in the draft stays above it. The editor reads its draft
 * when it mounts, so remount it afterwards.
 */
export const startDailyAnswer = (username: string, cacheKey: string, heading: string, dayKey: string) => {
  const key = cacheService.key(username, cacheKey);
  const draft = cacheService.loadDraft(key);
  const before = draft.content.trim() ? `${draft.content.trimEnd()}\n\n` : "";
  const opening = `${before}> ${heading}\n\n`;
  cacheService.saveNow(key, `${opening}\n\n#${dailyQuestionTag(dayKey)}`, draft.attachments);
  cacheService.saveCursor(key, opening.length);
};
