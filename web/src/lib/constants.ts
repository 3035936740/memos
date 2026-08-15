// TAB_SPACE_WIDTH is the default tab space width.
export const TAB_SPACE_WIDTH = 2;

// DEFAULT_LIST_MEMOS_PAGE_SIZE is the default page size for list memos request.
export const DEFAULT_LIST_MEMOS_PAGE_SIZE = 16;

// Instance-wide numbered feed pagination. The server setting uses zero to mean
// "not configured", which resolves to this default in every browser.
export const DEFAULT_MEMO_FEED_PAGE_SIZE = 10;
export const MIN_MEMO_FEED_PAGE_SIZE = 1;
export const MAX_MEMO_FEED_PAGE_SIZE = 100;

export const normalizeMemoFeedPageSize = (value: number | undefined) => {
  if (!value || !Number.isFinite(value)) return DEFAULT_MEMO_FEED_PAGE_SIZE;
  return Math.min(MAX_MEMO_FEED_PAGE_SIZE, Math.max(MIN_MEMO_FEED_PAGE_SIZE, Math.trunc(value)));
};

// LOADING_INDICATOR_DELAY_MS is how long a load must take before the loading spinner appears.
// Loads that finish faster than this never render the spinner, avoiding a flash on fast/self-hosted networks.
export const LOADING_INDICATOR_DELAY_MS = 250;

// Official companion browser extension for saving web content to Memos.
export const WEB_CLIPPER_URL = "https://github.com/usememos/web-clipper";
