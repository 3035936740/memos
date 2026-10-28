/** Posts written longer ago than this carry a note that they may be out of date. */
export const OUTDATED_AFTER_DAYS = 365;

/** Tags that keep a post free of the note however old it is. */
export const EVERGREEN_TAGS = ["长期有效", "長期有效", "evergreen"];

/** An edit at least this long after writing is named in the note; fixing a typo the same week is not. */
export const REVISION_AFTER_DAYS = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole years since `written` when the post counts as possibly out of date; undefined when it does not. */
export const outdatedYears = (written: Date | undefined, tags: readonly string[], now = new Date()): number | undefined => {
  if (!written) return undefined;
  if (tags.some((tag) => EVERGREEN_TAGS.includes(tag.toLowerCase()))) return undefined;
  const days = (now.getTime() - written.getTime()) / DAY_MS;
  if (days < OUTDATED_AFTER_DAYS) return undefined;
  return Math.max(1, Math.floor(days / 365.25));
};

/** The update worth naming next to the note, if the post was revised well after it was written. */
export const notableRevision = (written: Date | undefined, updated: Date | undefined): Date | undefined =>
  written && updated && updated.getTime() - written.getTime() >= REVISION_AFTER_DAYS * DAY_MS ? updated : undefined;
