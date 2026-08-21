import { Code, ConnectError } from "@connectrpc/connect";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpLeftFromCircleIcon, FolderIcon } from "lucide-react";
import { useCallback, useEffect, useMemo as useReactMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import BlogSidebar from "@/components/BlogSidebar";
import MemoCommentSection, { type CommentSortOrder } from "@/components/MemoCommentSection";
import { MentionResolutionProvider } from "@/components/MemoContent/MentionResolutionContext";
import MemoView from "@/components/MemoView";
import { Button } from "@/components/ui/button";
import { useAppSidebar } from "@/contexts/AppSidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import useMemoDetailError from "@/hooks/useMemoDetailError";
import { useInfiniteMemoComments, useMemo, useMemos, useRecordMemoView } from "@/hooks/useMemoQueries";
import { useSharedMemo, withShareAttachmentLinks } from "@/hooks/useMemoShareQueries";
import { canAccessInstanceContent, parseInstanceCategories } from "@/lib/instance-content";
import { isMemoNavigationScope, type MemoNavigationScope } from "@/lib/memo-navigation";
import { memoNamePrefix } from "@/lib/resource-names";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { findMemoAnchorTarget } from "@/utils/markdown-manipulation";

const MemoSidebarRegistration = ({
  memo,
  from,
  readonly,
  onShareImageOpen,
}: {
  memo: Memo;
  from?: string;
  readonly: boolean;
  onShareImageOpen: () => void;
}) => {
  const { setMemoDetail } = useAppSidebar();

  useEffect(() => {
    setMemoDetail({ memo, from, readonly, onShareImageOpen });
  }, [from, memo, onShareImageOpen, readonly, setMemoDetail]);

  useEffect(() => () => setMemoDetail(undefined), [setMemoDetail]);

  return null;
};

const MemoDetail = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { isInitialized: authInitialized } = useAuth();
  const { isInitialized: instanceInitialized, generalSetting } = useInstance();
  const currentUser = useCurrentUser();
  const [shareImageDialogOpen, setShareImageDialogOpen] = useState(false);
  const [commentSortOrder, setCommentSortOrder] = useState<CommentSortOrder>("asc");
  const params = useParams();
  const location = useLocation();
  const { state: locationState, hash } = location;
  const parentPage = typeof locationState?.from === "string" ? locationState.from : undefined;
  const handleShareImageOpen = useCallback(() => setShareImageDialogOpen(true), []);

  // Detect share mode from the route parameter.
  const shareToken = params.token;
  const isShareMode = !!shareToken;

  // Primary memo fetch — share token or direct name.
  const memoNameFromParams = params.uid ? `${memoNamePrefix}${params.uid}` : "";
  const {
    data: memoFromDirect,
    error: directError,
    isLoading: directLoading,
  } = useMemo(memoNameFromParams, { enabled: !isShareMode && !!memoNameFromParams });
  const { data: memoFromShare, error: shareError, isLoading: shareLoading } = useSharedMemo(shareToken ?? "", { enabled: isShareMode });

  const memo = isShareMode ? memoFromShare : memoFromDirect;
  const error = isShareMode ? shareError : directError;
  const isLoading = isShareMode ? shareLoading : directLoading;
  const memoName = memo?.name ?? memoNameFromParams;
  const { mutate: recordMemoView } = useRecordMemoView();
  const recordedMemoViewRef = useRef("");
  const [recordedView, setRecordedView] = useState<{ name: string; viewCount: bigint }>();
  useEffect(() => {
    if (!memo || memo.parent || recordedMemoViewRef.current === memo.name) return;

    recordedMemoViewRef.current = memo.name;
    recordMemoView(
      { name: memo.name, shareToken },
      {
        onSuccess: ({ viewCount }) => setRecordedView({ name: memo.name, viewCount }),
      },
    );
  }, [memo, recordMemoView, shareToken]);
  const currentCategory = memo?.category
    ? parseInstanceCategories(generalSetting.memoCategoriesJson).find(
        (category) => category.slug === memo.category && canAccessInstanceContent(category.access, currentUser),
      )
    : undefined;
  const resolvedParentPage = parentPage ?? "/explore";
  const fallbackNavigationScope: MemoNavigationScope = {
    state: memo?.state === State.ARCHIVED ? State.ARCHIVED : State.NORMAL,
    orderBy: "create_time desc",
  };
  const navigationScope = isMemoNavigationScope(locationState?.navigationScope) ? locationState.navigationScope : fallbackNavigationScope;
  const handleBack = useCallback(() => navigate(resolvedParentPage), [navigate, resolvedParentPage]);
  const { data: neighborCollection } = useMemos(
    {
      state: navigationScope.state,
      pageSize: 1000,
      orderBy: navigationScope.orderBy,
      filter: navigationScope.filter,
    },
    { enabled: !isShareMode && !!memo && !memo.parent },
  );
  const neighborIndex = neighborCollection?.memos.findIndex((item) => item.name === memoName) ?? -1;
  const previousMemo = neighborIndex > 0 ? neighborCollection?.memos[neighborIndex - 1] : undefined;
  const nextMemo = neighborIndex >= 0 ? neighborCollection?.memos[neighborIndex + 1] : undefined;
  const displayMemo = useReactMemo(() => {
    if (!memo) return undefined;
    const memoWithViewCount = recordedView?.name === memo.name ? { ...memo, viewCount: recordedView.viewCount } : memo;
    if (!isShareMode) return memoWithViewCount;
    return {
      ...memoWithViewCount,
      attachments: withShareAttachmentLinks(memo.attachments as Attachment[], shareToken!),
    };
  }, [isShareMode, memo, recordedView, shareToken]);

  useMemoDetailError({
    error: error as Error | null,
  });

  const { data: parentMemo } = useMemo(memo?.parent || "", {
    enabled: !isShareMode && !!memo?.parent,
  });

  const {
    data: comments = [],
    fetchNextPage: fetchNextComments,
    hasNextPage: hasNextComments,
    isFetchingNextPage: isFetchingNextComments,
  } = useInfiniteMemoComments(memoName, {
    enabled: !isShareMode && !!memo,
    orderBy: `create_time ${commentSortOrder}`,
  });

  // Scroll to the hash target once it's in the DOM. The effect re-runs as the memo loads (footnote
  // anchors) and as comments arrive (comment anchors), since the target may render in either; the
  // ref guards against re-scrolling the same hash on every later comments page-load.
  const scrolledHashRef = useRef("");
  useEffect(() => {
    if (!hash) return;
    const scrollKey = `${memoName}\0${hash}`;
    if (scrolledHashRef.current === scrollKey) return;
    const el = findMemoAnchorTarget(document, memoName, decodeURIComponent(hash.slice(1)));
    if (!el) return;
    scrolledHashRef.current = scrollKey;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hash, memo, memoName, comments]);

  if (isShareMode) {
    const isNotFound = error instanceof ConnectError && (error.code === Code.NotFound || error.code === Code.Unauthenticated);
    if (isNotFound || (!isLoading && !memo)) {
      return <Navigate to="/404" replace />;
    }
  }

  // Start the permitted requests as soon as routing is unlocked, but do not
  // expose content before tag-blur and instance display settings settle.
  if (isLoading || !memo || !displayMemo || !authInitialized || !instanceInitialized) {
    return null;
  }
  const mentionResolutionContents = [displayMemo.content, ...comments.map((comment) => comment.content)];
  const userResolutionNames = Array.from(
    new Set([displayMemo, ...comments].flatMap((item) => [item.creator, ...(item.reactions ?? []).map((reaction) => reaction.creator)])),
  );
  return (
    <section className="@container flex min-h-full w-full flex-col items-center pb-8 pt-2 sm:pt-4">
      <MentionResolutionProvider contents={mentionResolutionContents} userNames={userResolutionNames}>
        <MemoSidebarRegistration
          memo={displayMemo}
          from={resolvedParentPage}
          readonly={isShareMode}
          onShareImageOpen={handleShareImageOpen}
        />
        <div className="w-full max-w-6xl px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,48rem)_15rem] lg:items-start lg:gap-4">
          <main className="min-w-0">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <Button variant="ghost" className="-ml-2 text-muted-foreground" onClick={handleBack}>
                <ArrowLeftIcon />
                {t("memo.back-to-list")}
              </Button>
              {!isShareMode && currentCategory ? (
                <Button
                  render={<Link to={`/categories/${currentCategory.slug}`} />}
                  variant="ghost"
                  className="min-w-0 text-muted-foreground"
                >
                  <FolderIcon className="shrink-0" />
                  <span className="max-w-40 truncate">{currentCategory.title}</span>
                </Button>
              ) : null}
            </div>
            {!isShareMode && parentMemo && (
              <div className="w-auto inline-block mb-2">
                <Link
                  className="px-3 py-1 border border-border rounded-lg max-w-xs w-auto text-sm flex flex-row justify-start items-center flex-nowrap text-muted-foreground hover:shadow hover:opacity-80"
                  to={`/${parentMemo.name}`}
                  state={locationState}
                  viewTransition
                >
                  <ArrowUpLeftFromCircleIcon className="w-4 h-auto shrink-0 opacity-60 mr-2" />
                  <span className="truncate">{parentMemo.content}</span>
                </Link>
              </div>
            )}
            <MemoView
              key={displayMemo.name}
              memo={displayMemo}
              compact={false}
              parentPage={resolvedParentPage}
              navigationScope={navigationScope}
              shareImageDialogOpen={shareImageDialogOpen}
              showCreator
              showVisibility
              showPinned
              onShareImageDialogOpenChange={setShareImageDialogOpen}
            />
            {!isShareMode && !displayMemo.parent && (previousMemo || nextMemo) ? (
              <nav className="mt-4 grid gap-3 border-y border-border/70 py-4 sm:grid-cols-2" aria-label={t("memo.article-navigation")}>
                {previousMemo ? (
                  <Link
                    to={`/${previousMemo.name}`}
                    state={{ from: resolvedParentPage, navigationScope }}
                    className="group min-w-0 rounded-lg p-3 hover:bg-accent/40"
                  >
                    <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <ArrowLeftIcon className="size-3.5" />
                      {t("memo.previous-article")}
                    </span>
                    <span className="block truncate font-medium">{previousMemo.property?.title || previousMemo.snippet}</span>
                  </Link>
                ) : (
                  <span />
                )}
                {nextMemo ? (
                  <Link
                    to={`/${nextMemo.name}`}
                    state={{ from: resolvedParentPage, navigationScope }}
                    className="group min-w-0 rounded-lg p-3 text-right hover:bg-accent/40"
                  >
                    <span className="mb-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      {t("memo.next-article")}
                      <ArrowRightIcon className="size-3.5" />
                    </span>
                    <span className="block truncate font-medium">{nextMemo.property?.title || nextMemo.snippet}</span>
                  </Link>
                ) : null}
              </nav>
            ) : null}
            {!isShareMode && (
              <MemoCommentSection
                memo={displayMemo}
                comments={comments}
                parentPage={resolvedParentPage}
                hasMoreComments={hasNextComments}
                isFetchingMoreComments={isFetchingNextComments}
                onLoadMoreComments={fetchNextComments}
                sortOrder={commentSortOrder}
                onSortOrderChange={setCommentSortOrder}
              />
            )}
            <div className="mt-4 lg:hidden">
              <BlogSidebar
                state={navigationScope.state}
                orderBy={navigationScope.orderBy}
                filter={navigationScope.filter}
                parentPage={resolvedParentPage}
              />
            </div>
          </main>
          <aside className="sticky top-16 hidden max-h-[calc(100dvh-5rem)] min-w-0 self-start overflow-y-auto lg:block">
            <BlogSidebar
              state={navigationScope.state}
              orderBy={navigationScope.orderBy}
              filter={navigationScope.filter}
              parentPage={resolvedParentPage}
            />
          </aside>
        </div>
      </MentionResolutionProvider>
    </section>
  );
};

export default MemoDetail;
