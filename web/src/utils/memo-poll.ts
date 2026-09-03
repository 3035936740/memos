import { fromMarkdown } from "mdast-util-from-markdown";

export const MEMO_POLL_MARKER = "[[vote]]";

/** Find standalone poll markers in top-level text, excluding code, escapes and links. */
export function findMemoPollMarkers(content: string): { start: number; end: number }[] {
  if (!content.includes(MEMO_POLL_MARKER)) return [];
  const textRanges = fromMarkdown(content).children.flatMap((node) =>
    node.type === "paragraph"
      ? node.children.flatMap((child) =>
          child.type === "text" && child.position ? [{ start: child.position.start.offset ?? 0, end: child.position.end.offset ?? 0 }] : [],
        )
      : [],
  );
  return Array.from(content.matchAll(/^ {0,3}\[\[vote\]\][ \t]*\r?$/gm)).flatMap((match) => {
    const start = match.index;
    const markerStart = start + match[0].indexOf(MEMO_POLL_MARKER);
    return textRanges.some((range) => markerStart >= range.start && markerStart + MEMO_POLL_MARKER.length <= range.end)
      ? [{ start, end: start + match[0].length }]
      : [];
  });
}

/** Isolate marker paragraphs without splitting the rest of the Markdown document. */
export function prepareMemoPollContent(content: string): { content: string; markerOffsets: number[] } {
  const ranges = findMemoPollMarkers(content);
  if (ranges.length === 0) return { content, markerOffsets: [] };
  let output = "";
  let cursor = 0;
  const markerOffsets: number[] = [];
  for (const range of ranges) {
    output += `${content.slice(cursor, range.start)}\n\n`;
    markerOffsets.push(output.length);
    output += `${MEMO_POLL_MARKER}\n\n`;
    cursor = range.end;
  }
  return { content: output + content.slice(cursor), markerOffsets };
}

/** Keep an existing placement, or append one visible marker for a new/legacy poll. */
export function ensureMemoPollMarker(content: string): string {
  if (findMemoPollMarkers(content).length > 0) return content;
  return content.trim() ? `${content.trimEnd()}\n\n${MEMO_POLL_MARKER}` : MEMO_POLL_MARKER;
}

/** Remove active markers when deleting a poll or producing a list title/excerpt. */
export function removeMemoPollMarkers(content: string): string {
  let output = content;
  for (const range of findMemoPollMarkers(content).reverse()) {
    output = output.slice(0, range.start) + output.slice(range.end);
  }
  return output;
}
