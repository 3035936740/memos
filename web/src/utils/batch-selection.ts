/**
 * Batch tidying is started from the top toolbar, which sits outside the memo list: the toolbar asks with
 * BATCH_TOGGLE_EVENT and the list (MemoSelectionProvider) answers every change with BATCH_STATE_EVENT.
 */
export const BATCH_TOGGLE_EVENT = "memos-plus:batch-toggle";
export const BATCH_STATE_EVENT = "memos-plus:batch-state";

export interface BatchStateDetail {
  /** Whether the page has a list that can be tidied at all. */
  available: boolean;
  active: boolean;
}

export const requestBatchToggle = () => window.dispatchEvent(new Event(BATCH_TOGGLE_EVENT));

export const announceBatchState = (detail: BatchStateDetail) =>
  window.dispatchEvent(new CustomEvent<BatchStateDetail>(BATCH_STATE_EVENT, { detail }));
