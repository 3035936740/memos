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

const ALIGNMENT_OPEN_LINE = /^[ \t]*:::align[ \t]+(?:center|right)[ \t]*$/i;
const ALIGNMENT_CLOSE_LINE = /^[ \t]*:::[ \t]*$/;
const FENCE_LINE = /^[ \t]{0,3}(`{3,}|~{3,})/;

interface MarkdownFence {
  character: "`" | "~";
  length: number;
}

/**
 * CommonMark normally needs blank lines around a custom block marker. Users
 * should not have to know that implementation detail, so isolate complete
 * `:::align` marker lines before the Markdown parser sees them. Fenced code is
 * deliberately left untouched so examples remain literal source.
 */
export function normalizeMemoAlignmentBlocks(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let fence: MarkdownFence | undefined;
  let alignmentOpen = false;

  const appendBlankBoundary = () => {
    if (output.length > 0 && output.at(-1) !== "") output.push("");
  };

  for (const line of lines) {
    const fenceMatch = FENCE_LINE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const character = marker[0] as MarkdownFence["character"];
      if (!fence) {
        fence = { character, length: marker.length };
      } else if (fence.character === character && marker.length >= fence.length && /^[ \t]*$/.test(line.slice(fenceMatch[0].length))) {
        fence = undefined;
      }
      output.push(line);
      continue;
    }

    if (!fence && !alignmentOpen && ALIGNMENT_OPEN_LINE.test(line)) {
      appendBlankBoundary();
      output.push(line, "");
      alignmentOpen = true;
      continue;
    }

    if (!fence && alignmentOpen && ALIGNMENT_CLOSE_LINE.test(line)) {
      appendBlankBoundary();
      output.push(line, "");
      alignmentOpen = false;
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

/** Remove presentation-only memo markers when producing search/list excerpts. */
export function stripMemoRichTextMarkers(value: string): string {
  return value
    .replace(/:::align\s+(?:center|right)|:::/gi, " ")
    .replace(/\[(?:color|size)=[^\]\r\n]+\]/gi, "")
    .replace(/\[\/(?:color|size)\]/gi, "");
}
