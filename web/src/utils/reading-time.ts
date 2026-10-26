const CJK_PATTERN = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g;
const WORD_PATTERN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

/** Rough reading time in whole minutes: about 400 CJK characters or 220 words a minute, never under one. */
export const estimateReadingMinutes = (text: string): number => {
  const cjk = text.match(CJK_PATTERN)?.length ?? 0;
  const words = text.replace(CJK_PATTERN, " ").match(WORD_PATTERN)?.length ?? 0;
  return Math.max(1, Math.round(cjk / 400 + words / 220));
};
