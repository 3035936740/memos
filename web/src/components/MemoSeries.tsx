import { LibraryIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { createMemoNavigationState, type MemoOriginScope } from "@/components/MemoView/navigation";
import { useMemos } from "@/hooks/useMemoQueries";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { seriesFilterOf, seriesNameOf, seriesTagOf, seriesWindow } from "@/utils/memo-series";

/** A series lists at most this many posts. */
const SERIES_LIMIT = 200;
/** Longer series show this many posts around the current one until expanded. */
const COLLAPSED_SIZE = 5;

interface Props {
  memo: Memo;
  parentPage: string;
  parentScope: MemoOriginScope;
}

/**
 * The series an article belongs to (a #系列/… or #series/… tag): where it sits, the other posts in order of
 * writing, and links to them. Shown under the article when the series has at least two posts the reader can see.
 */
const MemoSeries = ({ memo, parentPage, parentScope }: Props) => {
  const t = useTranslate();
  const [expanded, setExpanded] = useState(false);
  const tag = seriesTagOf(memo.tags);
  const { data } = useMemos(
    { state: State.NORMAL, pageSize: SERIES_LIMIT, orderBy: "create_time asc", filter: tag ? seriesFilterOf(tag) : "" },
    { enabled: !!tag },
  );

  const posts = (data?.memos ?? []).filter((post) => !post.parent);
  const index = posts.findIndex((post) => post.name === memo.name);
  if (!tag || posts.length < 2 || index < 0) return null;

  const [start, end] = expanded ? [0, posts.length] : seriesWindow(posts.length, index, COLLAPSED_SIZE);
  const state = createMemoNavigationState(parentPage, parentScope);

  return (
    <nav
      aria-label={t("memo.series.label")}
      data-memo-series=""
      data-sb-subcard=""
      className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 font-medium">
          <LibraryIcon aria-hidden className="size-4 shrink-0 text-primary" />
          <span className="truncate">{t("memo.series.title", { name: seriesNameOf(tag) })}</span>
        </p>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {t("memo.series.position", { index: index + 1, total: posts.length })}
        </span>
      </div>
      <ol className="mt-2 flex flex-col gap-0.5">
        {posts.slice(start, end).map((post, offset) => {
          const number = start + offset + 1;
          const title = post.property?.title || post.snippet;
          const current = post.name === memo.name;
          return (
            <li key={post.name}>
              {current ? (
                <span aria-current="page" className="flex min-w-0 gap-2 rounded-md px-2 py-1 font-medium text-primary">
                  <span className="w-6 shrink-0 tabular-nums">{number}.</span>
                  <span className="truncate">{title}</span>
                </span>
              ) : (
                <Link
                  to={`/${post.name}`}
                  state={state}
                  className="flex min-w-0 gap-2 rounded-md px-2 py-1 text-foreground/85 hover:bg-accent hover:text-foreground"
                >
                  <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{number}.</span>
                  <span className="truncate">{title}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {posts.length > COLLAPSED_SIZE && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? t("memo.series.collapse") : t("memo.series.expand", { total: posts.length })}
        </button>
      )}
    </nav>
  );
};

export default MemoSeries;
