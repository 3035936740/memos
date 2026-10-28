import { afterEach, describe, expect, it } from "vitest";
import { cacheService } from "@/components/MemoEditor/services/cacheService";
import {
  bankLanguageFor,
  dayOfYear,
  hashText,
  questionIndexFor,
  readDailyQuestionSettings,
  resolveDailyQuestion,
  startDailyAnswer,
  yearOrder,
} from "@/utils/daily-question";
import en from "@/utils/daily-questions/en";
import zhHans from "@/utils/daily-questions/zh-Hans";
import zhHant from "@/utils/daily-questions/zh-Hant";

describe("daily question order", () => {
  it("hashes text the same way every time", () => {
    expect(hashText("2026:abc")).toBe(hashText("2026:abc"));
    expect(hashText("2026:abc")).not.toBe(hashText("2027:abc"));
    // FNV-1a of the empty string is its offset basis.
    expect(hashText("")).toBe(0x811c9dc5);
  });

  it("shuffles every question exactly once, differently per year and per seed", () => {
    const order = yearOrder(365, 2026, "seed-a");
    expect(new Set(order).size).toBe(365);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 365 }, (_, index) => index));
    expect(yearOrder(365, 2027, "seed-a")).not.toEqual(order);
    expect(yearOrder(365, 2026, "seed-b")).not.toEqual(order);
    expect(yearOrder(365, 2026, "seed-a")).toEqual(order);
  });

  it("gives every day of a year its own question", () => {
    const picked = new Set<number>();
    for (let day = 0; day < 365; day += 1) {
      picked.add(questionIndexFor(new Date(2026, 0, 1 + day), 365, "seed-a") ?? -1);
    }
    expect(picked.size).toBe(365);
    expect(picked.has(-1)).toBe(false);
  });

  it("draws the 366th day of a leap year from the list", () => {
    const leapDay = new Date(2028, 11, 31);
    expect(dayOfYear(leapDay)).toBe(366);
    const index = questionIndexFor(leapDay, 365, "seed-a");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(365);
    expect(questionIndexFor(leapDay, 365, "seed-a")).toBe(index);
  });

  it("uses every question once in each round, then reshuffles the next round", () => {
    const picked = Array.from({ length: 365 }, (_, day) => questionIndexFor(new Date(2026, 0, 1 + day), 67, "s"));
    for (let round = 0; round < 5; round++) expect(new Set(picked.slice(round * 67, (round + 1) * 67)).size).toBe(67);
    expect(new Set(picked.slice(335)).size).toBe(30);
    expect(picked.slice(0, 67)).not.toEqual(picked.slice(67, 134));
    const counts = Array.from({ length: 67 }, (_, index) => picked.filter((value) => value === index).length);
    expect(counts.filter((count) => count === 6)).toHaveLength(30);
    expect(counts.filter((count) => count === 5)).toHaveLength(37);
    expect(questionIndexFor(new Date(2026, 0, 1), 0, "s")).toBeUndefined();
  });

  it("counts days of the year from 1 January", () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
  });
});

describe("daily question banks", () => {
  it("resolves every custom UI language before falling back to English", () => {
    const custom = {
      text: "中文默认",
      locale: "zh-Hans",
      translations: { en: "English?", ja: "日本語？", fr: "Français ?", "en-GB": "British?" },
    };
    expect(resolveDailyQuestion(custom, "ja")).toBe("日本語？");
    expect(resolveDailyQuestion(custom, "fr-CA")).toBe("Français ?");
    expect(resolveDailyQuestion(custom, "en-GB")).toBe("British?");
    expect(resolveDailyQuestion(custom, "de")).toBe("English?");
    expect(resolveDailyQuestion(custom, "zh-CN")).toBe("中文默认");
    expect(resolveDailyQuestion({ text: "Legacy text" }, "ja")).toBe("Legacy text");
  });
  it("keeps built-in translations when a subset is selected and resolves custom fallbacks", () => {
    expect(resolveDailyQuestion({ builtin: 12 }, "zh-Hans", zhHans)).toBe(zhHans[12]);
    expect(resolveDailyQuestion({ builtin: 12 }, "en", en)).toBe(en[12]);
    const custom = { text: "Fallback?", locale: "en" as const, translations: { "zh-Hans": "自定义问题？" } };
    expect(resolveDailyQuestion(custom, "zh-Hans")).toBe("自定义问题？");
    expect(resolveDailyQuestion(custom, "zh-Hant")).toBe("Fallback?");
    expect(resolveDailyQuestion(custom, "en")).toBe("Fallback?");
  });
  it("has 365 questions in every language, none repeated", () => {
    for (const bank of [zhHans, zhHant, en]) {
      expect(bank).toHaveLength(365);
      expect(new Set(bank).size).toBe(365);
      expect(bank.every((question) => question.trim().length > 0)).toBe(true);
    }
  });

  it("picks the bank for the reader's language", () => {
    expect(bankLanguageFor("zh-Hans")).toBe("zh-Hans");
    expect(bankLanguageFor("zh-Hant")).toBe("zh-Hant");
    expect(bankLanguageFor("zh-TW")).toBe("zh-Hant");
    expect(bankLanguageFor("zh")).toBe("zh-Hans");
    expect(bankLanguageFor("ja")).toBe("en");
  });
});

describe("daily question settings", () => {
  afterEach(() => localStorage.clear());

  it("reads the site's seed and custom questions, dropping blanks", () => {
    const settings = readDailyQuestionSettings({ dailyQuestionSeed: "abc", dailyQuestionsJson: '["  One?  ", "", 3, "Two?"]' });
    expect(settings).toEqual({ seed: "abc", questions: ["One?", "Two?"], disabled: false });
  });

  it("falls back to the built-in questions and the site address", () => {
    const settings = readDailyQuestionSettings({ dailyQuestionsJson: "not json", disableDailyQuestion: true });
    expect(settings.questions).toBeUndefined();
    expect(settings.seed).toBe(window.location.host || "memos-plus");
    expect(settings.disabled).toBe(true);
  });

  it("starts an answer below an existing draft, with the cursor in the gap", () => {
    const key = cacheService.key("users/1", "home");
    cacheService.saveNow(key, "Earlier thoughts", []);
    startDailyAnswer("users/1", "home", "Q: What did you hear?", "2026-10-28");
    const { content } = cacheService.loadDraft(key);
    expect(content).toBe("Earlier thoughts\n\n> Q: What did you hear?\n\n\n\n#daily/2026-10-28");
    expect(content.slice(0, cacheService.loadCursor(key))).toBe("Earlier thoughts\n\n> Q: What did you hear?\n\n");
  });
});
