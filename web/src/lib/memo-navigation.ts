import { State } from "@/types/proto/api/v1/common_pb";

/** Exact list query used when a memo detail page was opened. */
export interface MemoNavigationScope {
  state: State;
  orderBy: string;
  filter?: string;
}

const SUPPORTED_ORDER_BY = /^(?:pinned desc, )?(?:create_time|update_time) (?:asc|desc)$/;

export const isMemoNavigationScope = (value: unknown): value is MemoNavigationScope => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MemoNavigationScope>;
  if (candidate.state !== State.NORMAL && candidate.state !== State.ARCHIVED) return false;
  if (typeof candidate.orderBy !== "string" || !SUPPORTED_ORDER_BY.test(candidate.orderBy)) return false;
  return candidate.filter === undefined || typeof candidate.filter === "string";
};
