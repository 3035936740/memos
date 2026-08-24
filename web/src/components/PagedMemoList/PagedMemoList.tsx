import { ArrowUpIcon, LoaderCircleIcon } from "lucide-react";
import { Fragment, type ReactElement, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import Blog2MemoView from "@/components/Blog2MemoView";
import BlogMemoView from "@/components/BlogMemoView";
import BlogSidebar from "@/components/BlogSidebar";
import { MentionResolutionProvider } from "@/components/MemoContent/MentionResolutionContext";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useInstance } from "@/contexts/InstanceContext";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { useNewMemo } from "@/contexts/NewMemoContext";
import { useView } from "@/contexts/ViewContext";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useMemos } from "@/hooks/useMemoQueries";
import { hoistMemoToFront } from "@/hooks/useMemoSorting";
import { LOADING_INDICATOR_DELAY_MS, normalizeMemoFeedPageSize } from "@/lib/constants";
import type { MemoNavigationScope } from "@/lib/memo-navigation";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import ColumnGrid, { columnCountForWidth, GRID_GAP } from "../ColumnGrid";
import MemoFilters from "../MemoFilters";
import Placeholder from "../Placeholder";
import MemoPagination from "./MemoPagination";
import { estimateMemoCardHeight } from "./memoCardHeight";

// Memo identity for React keys and grid planning. The pages use it for their renderer keys too,
// so flow-list and grid identity can never drift apart. Deliberately name-only: content updates
// reconcile in place (updateTime is a protobuf Timestamp object, not usable in a template string).
export const getMemoKey = (memo: Memo) => memo.name;

// Columns never stretch past this, so 2 columns on a wide monitor stay readable and the
// grid centers in the leftover space instead of filling it.
const MAX_COLUMN_WIDTH = 420;

const Loader = () => (
  <div className="w-full flex flex-row justify-center items-center py-8">
    <LoaderCircleIcon className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

interface Props {
  renderer: (memo: Memo, options: { compact: boolean; parentPage: string; navigationScope: MemoNavigationScope }) => ReactElement;
  listSort?: (list: Memo[]) => Memo[];
  state?: State;
  orderBy?: string;
  filter?: string;
  pageSize?: number;
  showCreator?: boolean;
  enabled?: boolean;
  /** Route-owned content rendered before the list and inside column one in grid mode. */
  renderLeading?: (options: { useGrid: boolean }) => ReactNode;
}

const PagedMemoList = (props: Props) => {
  const t = useTranslate();
  const { isUserSettingsInitialized } = useAuth();
  const { generalSetting } = useInstance();
  const { filters } = useMemoFilterContext();
  const { maxColumns, compactMode, feedLayout = "memo" } = useView();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageSize = normalizeMemoFeedPageSize(props.pageSize ?? generalSetting.memoPageSize);
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const parentPage = `${location.pathname}${location.search}`;
  const navigationScope = useMemo<MemoNavigationScope>(
    () => ({
      state: props.state ?? State.NORMAL,
      orderBy: props.orderBy ?? "create_time desc",
      filter: props.filter,
    }),
    [props.filter, props.orderBy, props.state],
  );

  const goToPage = useCallback(
    (page: number, options?: { replace?: boolean; scroll?: boolean }) => {
      const nextPage = Math.max(1, Math.trunc(page));
      const nextParams = new URLSearchParams(searchParams);
      if (nextPage === 1) nextParams.delete("page");
      else nextParams.set("page", nextPage.toString());
      setSearchParams(nextParams, { replace: options?.replace ?? false });
      if (options?.scroll ?? true) window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [searchParams, setSearchParams],
  );

  const paginationScope = `${props.state ?? State.NORMAL}|${props.orderBy ?? "create_time desc"}|${props.filter ?? ""}|${pageSize}`;
  const previousPaginationScopeRef = useRef(paginationScope);
  useEffect(() => {
    if (previousPaginationScopeRef.current === paginationScope) return;
    previousPaginationScopeRef.current = paginationScope;
    if (currentPage !== 1) goToPage(1, { replace: true, scroll: false });
  }, [currentPage, goToPage, paginationScope]);
  // maxColumns is a ceiling: 1 = single reading column, 0 = as many as fit. The single
  // column renders in normal document flow; anything wider becomes the packed grid.
  const multiColumn = feedLayout === "memo" && maxColumns !== 1;

  // Measure the available width: when it only fits one column anyway, render the flow
  // layout rather than a degenerate one-column grid (capped tiles, composer-as-tile).
  // Only the boolean is stored, so continuous resizes re-render nothing until the
  // one-column threshold is actually crossed.
  const layoutMeasureRef = useRef<HTMLDivElement>(null);
  const [fitsGridWidth, setFitsGridWidth] = useState<boolean | undefined>(undefined);
  useLayoutEffect(() => {
    const el = layoutMeasureRef.current;
    if (!el) return;
    const apply = (nextWidth: number) => setFitsGridWidth(columnCountForWidth(nextWidth) >= 2);
    apply(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const useGrid = multiColumn && (fitsGridWidth ?? true);
  // Grid tiles are always bounded/compact; the narrow-width fallback behaves exactly like
  // maxColumns = 1, so it respects the user's own compact setting. Centralized here so the
  // pages don't each repeat the policy.
  const effectiveCompact = compactMode || useGrid;
  const isBlogFeed = feedLayout === "blog-classic" || feedLayout === "blog2";

  const renderMemo = (memo: Memo) => (
    <Fragment key={getMemoKey(memo)}>
      {feedLayout === "blog-classic" ? (
        <BlogMemoView memo={memo} showCreator={props.showCreator} parentPage={parentPage} navigationScope={navigationScope} />
      ) : feedLayout === "blog2" ? (
        <Blog2MemoView memo={memo} showCreator={props.showCreator} parentPage={parentPage} navigationScope={navigationScope} />
      ) : (
        props.renderer(memo, { compact: effectiveCompact, parentPage, navigationScope })
      )}
    </Fragment>
  );

  const { data, isLoading } = useMemos(
    {
      state: props.state || State.NORMAL,
      orderBy: props.orderBy || "create_time desc",
      filter: props.filter,
      pageSize,
      pageOffset: (currentPage - 1) * pageSize,
      showTotalSize: true,
    },
    { enabled: props.enabled ?? true, refetchInterval: 30_000 },
  );

  // Tag settings decide whether sensitive memo content must be blurred. Keep that
  // privacy boundary, but do not wait for unrelated memo views or instance settings.
  const isDisplayPending = isLoading || !isUserSettingsInitialized;
  const showLoader = useDelayedFlag(isDisplayPending, LOADING_INDICATOR_DELAY_MS);

  const memos = useMemo(() => data?.memos ?? [], [data?.memos]);
  const totalPages = Math.max(1, Math.ceil((data?.totalSize ?? 0) / pageSize));

  useEffect(() => {
    if (!isLoading && data && currentPage > totalPages) {
      goToPage(totalPages, { replace: true, scroll: false });
    }
  }, [currentPage, data, goToPage, isLoading, totalPages]);

  // Apply custom sorting if provided, otherwise use memos directly, then hoist
  // a freshly created memo to the very top so it stays visible above pins.
  const { newMemoName } = useNewMemo();
  const sortedMemoList = useMemo(() => {
    const sorted = props.listSort ? props.listSort(memos) : memos;
    return hoistMemoToFront(sorted, newMemoName);
  }, [memos, props.listSort, newMemoName]);

  const leadingContent = props.renderLeading?.({ useGrid });

  // A freshly created memo is hoisted to the front; pin it to the top of column one so it
  // appears right under the composer instead of dropping into a random (shortest) column.
  const displayMemoList = isDisplayPending ? [] : sortedMemoList;
  const blog2FeaturedMemo = displayMemoList[0];
  const blog2SecondaryMemos = displayMemoList.slice(1);
  const blog2DesktopRows: Memo[][] = [];
  for (let offset = 0, rowSize = 2; offset < blog2SecondaryMemos.length; rowSize = rowSize === 2 ? 1 : 2) {
    blog2DesktopRows.push(blog2SecondaryMemos.slice(offset, offset + rowSize));
    offset += rowSize;
  }
  const firstMemo = displayMemoList[0];
  const priorityKey = newMemoName && firstMemo?.name === newMemoName ? getMemoKey(firstMemo) : undefined;

  // Stable reference so MentionResolutionProvider's memo (keyed on the array) actually holds.
  const contents = useMemo(() => displayMemoList.map((memo) => memo.content), [displayMemoList]);
  const userNames = useMemo(
    () =>
      Array.from(
        new Set(
          displayMemoList.flatMap((memo) => [
            ...(props.showCreator ? [memo.creator] : []),
            ...(memo.reactions ?? []).map((reaction) => reaction.creator),
          ]),
        ),
      ),
    [props.showCreator, displayMemoList],
  );

  const emptyPlaceholder =
    !isDisplayPending && displayMemoList.length === 0 ? (
      <Placeholder variant="empty" message={t("message.no-data")} className="w-full" />
    ) : null;
  const initialLoader = isDisplayPending && showLoader ? <Loader /> : null;

  // Column one is the action column: the composer and any active filters head it, and the
  // empty state follows them. The newest memo also lands directly beneath them (priorityKey
  // above). Every vertical seam inside the stack uses GRID_GAP so y-spacing matches the
  // grid's x-spacing exactly.
  const hasFilters = filters.length > 0;
  const gridLeading =
    leadingContent || hasFilters || initialLoader || emptyPlaceholder ? (
      <div className="flex w-full flex-col" style={{ gap: GRID_GAP }}>
        {leadingContent}
        <MemoFilters />
        {initialLoader}
        {emptyPlaceholder}
      </div>
    ) : undefined;

  // Numbered pagination is shared by the memo cards, grid, and blog layouts.
  const footer = (
    <>
      <MemoPagination currentPage={currentPage} totalPages={totalPages} onPageChange={goToPage} />
      {isBlogFeed && (
        <div className="mt-4 lg:hidden">
          <BlogSidebar state={props.state} orderBy={props.orderBy} filter={props.filter} parentPage={parentPage} />
        </div>
      )}
      {displayMemoList.length > 0 && (
        <div className="my-2 flex w-full flex-row items-center justify-center opacity-70">
          <BackToTop />
        </div>
      )}
    </>
  );

  const children = (
    <MentionResolutionProvider contents={contents} userNames={userNames}>
      <div ref={layoutMeasureRef} className="w-full">
        {isBlogFeed && !useGrid ? (
          <div
            data-feed-layout={feedLayout}
            className={cn(
              "mx-auto w-full lg:grid lg:items-start lg:gap-5",
              feedLayout === "blog2" ? "max-w-7xl lg:grid-cols-[minmax(0,1fr)_16rem]" : "max-w-6xl lg:grid-cols-[minmax(0,1fr)_15rem]",
            )}
          >
            <main className="flex min-w-0 flex-col justify-start">
              {leadingContent}
              <MemoFilters className="mb-2" />
              {initialLoader}
              {feedLayout === "blog2" ? (
                <div>
                  {blog2FeaturedMemo && (
                    <Blog2MemoView
                      key={getMemoKey(blog2FeaturedMemo)}
                      memo={blog2FeaturedMemo}
                      featured
                      showCreator={props.showCreator}
                      parentPage={parentPage}
                      navigationScope={navigationScope}
                    />
                  )}
                  <div className="mt-4 flex flex-col gap-4 sm:hidden">
                    {blog2SecondaryMemos.map((memo) => (
                      <Blog2MemoView
                        key={getMemoKey(memo)}
                        memo={memo}
                        showCreator={props.showCreator}
                        parentPage={parentPage}
                        navigationScope={navigationScope}
                      />
                    ))}
                  </div>
                  <div className="mt-4 hidden flex-col gap-4 sm:flex">
                    {blog2DesktopRows.map((row) =>
                      row.length === 1 ? (
                        <Blog2MemoView
                          key={getMemoKey(row[0]!)}
                          memo={row[0]!}
                          featured
                          showCreator={props.showCreator}
                          parentPage={parentPage}
                          navigationScope={navigationScope}
                        />
                      ) : (
                        <div key={row.map(getMemoKey).join("|")} className="grid grid-cols-2 items-stretch gap-4">
                          {row.map((memo) => (
                            <Blog2MemoView
                              key={getMemoKey(memo)}
                              memo={memo}
                              showCreator={props.showCreator}
                              parentPage={parentPage}
                              navigationScope={navigationScope}
                            />
                          ))}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                displayMemoList.map(renderMemo)
              )}
              {emptyPlaceholder}
              {!isDisplayPending && footer}
            </main>
            <aside className="sticky top-16 hidden max-h-[calc(100dvh-5rem)] min-w-0 self-start overflow-y-auto lg:block">
              <BlogSidebar state={props.state} orderBy={props.orderBy} filter={props.filter} parentPage={parentPage} />
            </aside>
          </div>
        ) : (
          <div className={cn("mx-auto flex w-full flex-col justify-start", useGrid ? "max-w-none" : "max-w-2xl")}>
            {useGrid ? (
              <>
                <ColumnGrid
                  items={displayMemoList}
                  getKey={getMemoKey}
                  renderItem={renderMemo}
                  estimateHeight={estimateMemoCardHeight}
                  leading={gridLeading}
                  priorityKey={priorityKey}
                  maxColumns={maxColumns}
                  maxColumnWidth={MAX_COLUMN_WIDTH}
                />
                {!isDisplayPending && footer}
              </>
            ) : (
              <>
                {leadingContent}
                <MemoFilters className="mb-2" />
                {initialLoader}
                {displayMemoList.map(renderMemo)}
                {emptyPlaceholder}
                {!isDisplayPending && footer}
              </>
            )}
          </div>
        )}
      </div>
    </MentionResolutionProvider>
  );

  return children;
};

const BackToTop = () => {
  const t = useTranslate();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.scrollY > 400;
      setIsVisible(shouldShow);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  return (
    <Button variant="ghost" onClick={scrollToTop}>
      {t("router.back-to-top")}
      <ArrowUpIcon className="ml-1 w-4 h-auto" />
    </Button>
  );
};

export default PagedMemoList;
