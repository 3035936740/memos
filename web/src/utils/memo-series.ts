/** Tag prefixes that put a post in a series: #系列/名字 or #series/name. */
export const SERIES_TAG_PREFIXES = ["系列/", "series/"];

/** The memo's series tag, if it has one; the first wins when a post sits in several. */
export const seriesTagOf = (tags: readonly string[]): string | undefined =>
  tags.find((tag) => SERIES_TAG_PREFIXES.some((prefix) => tag.toLowerCase().startsWith(prefix) && tag.length > prefix.length));

/** The series' name: the tag after its prefix. */
export const seriesNameOf = (tag: string) => tag.slice(tag.indexOf("/") + 1);

/** The memo filter that lists a series. JSON string quoting is also a valid CEL string literal. */
export const seriesFilterOf = (tag: string) => `tag in [${JSON.stringify(tag)}]`;

/**
 * Which posts of a long series to list while it is collapsed: `size` of them around the current one, keeping it in
 * the middle where it can be, as [start, end).
 */
export const seriesWindow = (total: number, current: number, size: number): [number, number] => {
  if (total <= size) return [0, total];
  const start = Math.min(Math.max(0, current - Math.floor(size / 2)), total - size);
  return [start, start + size];
};
