export type MemoTextAlignment = "left" | "center" | "right";

const RGBA_PATTERN = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/i;
const RGBA_COMPONENTS_PATTERN = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*$/;

/** Accept only numeric RGB channels and a 0..1 alpha value. */
export function normalizeMemoTextColor(value: string | undefined): string | undefined {
  const input = value?.trim();
  if (!input) return undefined;
  const match = RGBA_PATTERN.exec(input) ?? RGBA_COMPONENTS_PATTERN.exec(input);
  if (!match) return undefined;

  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if ([red, green, blue].some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) return undefined;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return undefined;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function isMemoTextAlignment(value: unknown): value is MemoTextAlignment {
  return value === "left" || value === "center" || value === "right";
}

export const memoAlignmentOpenMarker = (alignment: Exclude<MemoTextAlignment, "left">): string => `:::align ${alignment}`;
export const MEMO_ALIGNMENT_CLOSE_MARKER = ":::";

export const memoColorOpenMarker = (color: string): string => `[color=${color}]`;
export const MEMO_COLOR_CLOSE_MARKER = "[/color]";

const FONT_SIZE_PATTERN = /^(\d{1,3})(?:px)?$/i;

/** Accept only whole-pixel font sizes that cannot break the surrounding layout. */
export function normalizeMemoTextSize(value: string | undefined): string | undefined {
  const match = FONT_SIZE_PATTERN.exec(value?.trim() ?? "");
  if (!match) return undefined;
  const size = Number(match[1]);
  if (!Number.isInteger(size) || size < 8 || size > 96) return undefined;
  return `${size}px`;
}

export const memoSizeOpenMarker = (size: string): string => `[size=${size}]`;
export const MEMO_SIZE_CLOSE_MARKER = "[/size]";

export const MEMO_SPOILER_MARKER = "||";
