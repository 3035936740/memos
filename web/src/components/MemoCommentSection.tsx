import { ArrowDownWideNarrowIcon, ArrowUpNarrowWideIcon, LoaderCircleIcon, LogInIcon, MessageCircleIcon } from "lucide-react";
import { type ComponentType, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { loadMemoEditor } from "@/components/MemoEditor/loader";
import type { MemoEditorProps } from "@/components/MemoEditor/types";
import MemoView from "@/components/MemoView";
import { computeCommentAmount } from "@/components/MemoView/MemoViewContext";
import { Button } from "@/components/ui/button";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useInfiniteMemoComments } from "@/hooks/useMemoQueries";
import useNavigateTo from "@/hooks/useNavigateTo";
import { extractMemoIdFromName } from "@/lib/resource-names";
import { type Memo, MemoRelation_Type } from "@/types/proto/api/v1/memo_service_pb";
import { buildAuthRoute } from "@/utils/auth-redirect";
import { useTranslate } from "@/utils/i18n";

interface Props {
  memo: Memo;
  comments: Memo[];
  parentPage?: string;
  hasMoreComments?: boolean;
  isFetchingMoreComments?: boolean;
  onLoadMoreComments?: () => void;
  sortOrder?: CommentSortOrder;
  onSortOrderChange?: (sortOrder: CommentSortOrder) => void;
}

export type CommentSortOrder = "asc" | "desc";

interface CommentThreadProps {
  comment: Memo;
  parentPage?: string;
  replyToMemo: string;
  renderReplyEditor: () => ReactNode;
  sortOrder: CommentSortOrder;
  floorPath: number[];
  depth?: number;
}

const CommentThread = ({ comment, parentPage, replyToMemo, renderReplyEditor, sortOrder, floorPath, depth = 0 }: CommentThreadProps) => {
  const t = useTranslate();
  const hasNestedReplies =
    comment.relations?.some((relation) => relation.type === MemoRelation_Type.COMMENT && relation.relatedMemo?.name === comment.name) ??
    false;
  const {
    data: replies = [],
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteMemoComments(comment.name, {
    enabled: hasNestedReplies || replyToMemo === comment.name,
    pageSize: 50,
    orderBy: `create_time ${sortOrder}`,
  });
  const totalReplies = Math.max(computeCommentAmount(comment), replies.length);
  const floorLabel =
    floorPath.length === 1
      ? t("memo.comment.floor", { floor: floorPath[0] })
      : t("memo.comment.reply-floor", { floor: floorPath[0], reply: floorPath.slice(1).join(".") });

  return (
    <div>
      <div className="relative w-full" id={extractMemoIdFromName(comment.name)}>
        <span
          data-testid={`comment-floor-${comment.name}`}
          className="pointer-events-none absolute right-[6.75rem] top-3 z-10 rounded-full bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          {floorLabel}
        </span>
        <MemoView memo={comment} parentPage={parentPage} showCreator compact hideCommentPreview />
      </div>

      {replyToMemo === comment.name && <div className="mt-2">{renderReplyEditor()}</div>}

      {replies.length > 0 && (
        <div className={depth === 0 ? "mt-2 flex flex-col gap-2 border-l border-border/80 pl-3 sm:pl-5" : "mt-2 flex flex-col gap-2"}>
          {replies.map((reply, index) => (
            <CommentThread
              key={reply.name}
              comment={reply}
              parentPage={parentPage}
              replyToMemo={replyToMemo}
              renderReplyEditor={renderReplyEditor}
              sortOrder={sortOrder}
              floorPath={[...floorPath, sortOrder === "asc" ? index + 1 : totalReplies - index]}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="mt-2 flex justify-start pl-3">
          <Button variant="ghost" size="sm" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage && <LoaderCircleIcon className="size-4 animate-spin" />}
            {t(isFetchingNextPage ? "resource.fetching-data" : "memo.load-more")}
          </Button>
        </div>
      )}
    </div>
  );
};

const MemoCommentSection = ({
  memo,
  comments,
  parentPage,
  hasMoreComments,
  isFetchingMoreComments,
  onLoadMoreComments,
  sortOrder: controlledSortOrder,
  onSortOrderChange,
}: Props) => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const navigateTo = useNavigateTo();
  const location = useLocation();
  const quickReplyHandled = useRef("");
  const [showEditor, setShowEditor] = useState(false);
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [EditorComponent, setEditorComponent] = useState<ComponentType<MemoEditorProps>>();
  const [replyToMemo, setReplyToMemo] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [internalSortOrder, setInternalSortOrder] = useState<CommentSortOrder>("asc");
  const sortOrder = controlledSortOrder ?? internalSortOrder;
  const totalCommentCount = Math.max(computeCommentAmount(memo), comments.length);

  const showCreateButton = !showEditor;

  const setSortOrder = (nextSortOrder: CommentSortOrder) => {
    setInternalSortOrder(nextSortOrder);
    onSortOrderChange?.(nextSortOrder);
  };

  const handleCommentCreated = async (_memoCommentName: string) => {
    setShowEditor(false);
    setReplyToMemo("");
    setInitialContent("");
  };

  const preloadEditor = useCallback(() => {
    void loadMemoEditor().catch(() => undefined);
  }, []);

  const openEditor = useCallback(async () => {
    if (isEditorLoading) {
      return;
    }

    setIsEditorLoading(true);
    try {
      const { default: MemoEditor } = await loadMemoEditor();
      setEditorComponent(() => MemoEditor);
      setShowEditor(true);
    } catch {
      // Chunk failures are handled by loadWithReload; keep the current UI mounted.
    } finally {
      setIsEditorLoading(false);
    }
  }, [isEditorLoading]);

  const openCommentComposer = useCallback(() => {
    if (!currentUser) {
      navigateTo(
        buildAuthRoute({
          redirect: `${location.pathname}${location.search}${location.hash}`,
        }),
      );
      return;
    }
    setReplyToMemo("");
    setInitialContent("");
    void openEditor();
  }, [currentUser, location.hash, location.pathname, location.search, navigateTo, openEditor]);

  useEffect(() => {
    const state = location.state as {
      quickReplyMemo?: string;
      replyToMemo?: string;
      quickReplyContent?: string;
      quickReplyRequest?: number;
    } | null;
    const requestKey = `${state?.quickReplyMemo ?? ""}:${state?.replyToMemo ?? "root"}:${state?.quickReplyRequest ?? 0}`;
    if (quickReplyHandled.current === requestKey || !currentUser || state?.quickReplyMemo !== memo.name) return;
    quickReplyHandled.current = requestKey;
    setReplyToMemo(state.replyToMemo ?? "");
    setInitialContent(state.quickReplyContent ?? "");
    void openEditor();
  }, [currentUser, location.state, memo.name, openEditor]);

  const renderEditor = () =>
    showEditor && EditorComponent ? (
      <div className="w-full">
        <EditorComponent
          key={replyToMemo || "comment"}
          cacheKey={replyToMemo ? `${memo.name}-reply-${replyToMemo}` : `${memo.name}-comment`}
          placeholder={t("editor.add-your-comment-here")}
          parentMemoName={replyToMemo || memo.name}
          initialContent={initialContent}
          autoFocus
          onConfirm={handleCommentCreated}
          onCancel={() => {
            setShowEditor(false);
            setReplyToMemo("");
            setInitialContent("");
          }}
        />
      </div>
    ) : null;

  return (
    <div data-memo-comment-section="" className="mt-3 w-full pb-2 lg:mt-5 lg:pb-8">
      <div
        data-comment-section-header=""
        className="flex min-h-11 w-full flex-wrap items-center justify-between gap-3 border-b border-border pb-3"
      >
        <h2 id="comments" className="flex items-baseline gap-1.5 text-base font-medium text-foreground">
          {t("memo.comment.self")}
          <span className="text-xs font-normal text-muted-foreground">{totalCommentCount}</span>
        </h2>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            data-comment-sort-control=""
            className="flex items-center rounded-md border border-border p-0.5"
            role="group"
            aria-label={t("memo.comment.sort-order")}
          >
            <Button
              type="button"
              size="sm"
              variant={sortOrder === "asc" ? "secondary" : "ghost"}
              className="h-7 gap-1 px-2 text-xs"
              aria-pressed={sortOrder === "asc"}
              onClick={() => setSortOrder("asc")}
            >
              <ArrowUpNarrowWideIcon className="size-3.5" />
              {t("memo.comment.sort-ascending")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sortOrder === "desc" ? "secondary" : "ghost"}
              className="h-7 gap-1 px-2 text-xs"
              aria-pressed={sortOrder === "desc"}
              onClick={() => setSortOrder("desc")}
            >
              <ArrowDownWideNarrowIcon className="size-3.5" />
              {t("memo.comment.sort-descending")}
            </Button>
          </div>
          {showCreateButton && (
            <Button
              size="sm"
              className="border-0 shadow-none outline-none ring-0 hover:shadow-xs focus-visible:ring-0"
              onPointerEnter={preloadEditor}
              onFocus={preloadEditor}
              onClick={openCommentComposer}
              disabled={isEditorLoading}
            >
              {isEditorLoading ? <LoaderCircleIcon className="size-4 animate-spin" /> : <MessageCircleIcon />}
              {t("memo.comment.write-a-comment")}
            </Button>
          )}
        </div>
      </div>

      {!currentUser && (
        <div
          data-comment-login-prompt=""
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-1 rounded-lg bg-muted/70 px-4 text-sm text-muted-foreground"
        >
          <LogInIcon className="mr-1 size-4 opacity-60" />
          <span>{t("memo.comment.guest-prefix")}</span>
          <Button variant="link" className="h-auto px-1 py-0 font-semibold" onClick={openCommentComposer}>
            {t("memo.comment.sign-in-to-comment")}
          </Button>
          <span>{t("memo.comment.guest-suffix")}</span>
        </div>
      )}

      {!replyToMemo && showEditor && <div className="mt-3">{renderEditor()}</div>}

      {comments.length === 0 && !hasMoreComments && !showEditor && (
        <div
          data-comment-empty-state=""
          className="flex min-h-12 w-full items-center justify-center px-4 pt-4 text-center text-xs text-muted-foreground/65 lg:min-h-24"
        >
          {t("memo.comment.empty")}
        </div>
      )}

      <div className="mt-3 flex w-full flex-col gap-3">
        {comments.map((comment, index) => (
          <CommentThread
            key={comment.name}
            comment={comment}
            parentPage={parentPage}
            replyToMemo={replyToMemo}
            renderReplyEditor={renderEditor}
            sortOrder={sortOrder}
            floorPath={[sortOrder === "asc" ? index + 1 : totalCommentCount - index]}
          />
        ))}
        {hasMoreComments && (
          <div className="w-full mt-4 flex justify-center">
            <Button variant="outline" className="rounded-full px-4" onClick={onLoadMoreComments} disabled={isFetchingMoreComments}>
              {isFetchingMoreComments && <LoaderCircleIcon className="h-4 w-4 animate-spin" />}
              {t(isFetchingMoreComments ? "resource.fetching-data" : "memo.load-more")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MemoCommentSection;
