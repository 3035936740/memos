import { timestampDate } from "@bufbuild/protobuf/wkt";
import { BanIcon, CalendarClockIcon, EyeIcon, EyeOffIcon, FilePenLineIcon, MessageCircleIcon, PaperclipIcon, PinIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deriveBlogMemoText } from "@/components/BlogMemoView";
import { useResolvedUser } from "@/components/MemoContent/MentionResolutionContext";
import RelativeTime from "@/components/RelativeTime";
import UserAvatar from "@/components/UserAvatar";
import i18n from "@/i18n";
import type { MemoNavigationScope } from "@/lib/memo-navigation";
import { extractUsernameFromName } from "@/lib/resource-names";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { getAttachmentType, isMotionAttachment } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";
import { buildAttachmentVisualItems } from "@/utils/media-item";
import { computeCommentAmount } from "./MemoView/MemoViewContext";

interface Props {
  memo: Memo;
  featured?: boolean;
  showCreator?: boolean;
  parentPage?: string;
  navigationScope?: MemoNavigationScope;
}

const Blog2MemoView = ({ memo, featured = false, showCreator = false, parentPage, navigationScope }: Props) => {
  const t = useTranslate();
  const [coverFailed, setCoverFailed] = useState(false);
  const shouldShowCreator = showCreator || Boolean(memo.creator);
  const creator = useResolvedUser(memo.creator, { enabled: shouldShowCreator });
  const { title, excerpt } = useMemo(() => deriveBlogMemoText(memo.content, memo.property?.title), [memo.content, memo.property?.title]);
  const cover = useMemo(() => {
    const visualAttachments = memo.attachments.filter((attachment) => {
      const type = getAttachmentType(attachment);
      return type === "image/*" || type === "video/*" || isMotionAttachment(attachment);
    });
    return buildAttachmentVisualItems(visualAttachments).find((item) => item.kind !== "video");
  }, [memo.attachments]);
  const createTime = memo.createTime ? timestampDate(memo.createTime) : undefined;
  const commentAmount = computeCommentAmount(memo);
  const detailPath = `/${memo.name}`;
  const detailState = { from: parentPage, navigationScope };
  const creatorUsername = creator?.username || extractUsernameFromName(memo.creator);
  const creatorLabel = creator?.displayName || creatorUsername;
  const visibleCover = coverFailed ? undefined : cover;
  const isCompactDynamic = !visibleCover && !excerpt.trim();

  useEffect(() => {
    setCoverFailed(false);
  }, [cover?.posterUrl]);

  const badges = (
    <div className="flex min-h-5 flex-wrap items-center gap-1.5">
      {memo.draft && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {memo.publishTime ? <CalendarClockIcon className="size-3" /> : <FilePenLineIcon className="size-3" />}
          {memo.publishTime ? t("memo.publication.scheduled") : t("memo.publication.draft")}
        </span>
      )}
      {memo.hidden && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <EyeOffIcon className="size-3" />
          {t("memo.hidden.label")}
        </span>
      )}
      {memo.quarantined && (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
          <BanIcon className="size-3" />
          {t("moderation.quarantined")}
        </span>
      )}
      {memo.pinned && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          <PinIcon className="size-3" />
          {t("common.pinned")}
        </span>
      )}
      {memo.tags.slice(0, featured ? 4 : 2).map((tag) => (
        <span key={tag} className="rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          #{tag}
        </span>
      ))}
      {memo.tags.length === 0 && (
        <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("memo.blog-dynamic")}</span>
      )}
    </div>
  );

  const coverLink = visibleCover ? (
    <Link
      to={detailPath}
      state={detailState}
      aria-label={title || t("memo.blog-untitled")}
      className="relative order-2 my-3 block aspect-[4/3] w-full self-start overflow-hidden rounded-sm bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:my-4"
    >
      <img
        src={visibleCover.posterUrl}
        alt=""
        className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
        loading="lazy"
        onError={() => setCoverFailed(true)}
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-70" />
    </Link>
  ) : null;

  return (
    <article
      data-blog2-card=""
      className={cn(
        "group relative isolate flex h-full min-w-0 flex-col overflow-hidden rounded-md bg-card text-card-foreground shadow-xs transition-shadow duration-200 hover:shadow-sm",
      )}
    >
      <div
        className={cn(
          "grid h-full min-w-0",
          visibleCover ? "grid-cols-[minmax(0,1fr)_5.5rem] gap-3 pr-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:gap-4 sm:pr-4" : "grid-cols-1",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col p-4">
          {badges}

          <Link
            to={detailPath}
            state={detailState}
            className="mt-2.5 block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <h2
              className={cn(
                "line-clamp-2 font-semibold tracking-[-0.025em] text-foreground transition-colors group-hover:text-primary",
                featured && !isCompactDynamic ? "text-2xl leading-tight sm:text-[1.65rem]" : "text-lg leading-snug sm:text-xl",
              )}
            >
              {title || t("memo.blog-untitled")}
            </h2>
          </Link>

          {excerpt && (
            <p className={cn("mt-2 text-sm leading-6 text-muted-foreground", featured ? "line-clamp-3 max-w-2xl" : "line-clamp-3")}>
              {excerpt}
            </p>
          )}

          <footer className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            {shouldShowCreator && creatorLabel && (
              <Link
                to={`/u/${encodeURIComponent(creatorUsername)}`}
                className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-foreground"
              >
                <UserAvatar avatarUrl={creator?.avatarUrl} className="size-5 rounded-md" />
                <span className="max-w-28 truncate">{creatorLabel}</span>
              </Link>
            )}
            {createTime && <RelativeTime date={createTime} />}
            <span className="inline-flex items-center gap-1" title={t("common.view-count")}>
              <EyeIcon className="size-3.5" />
              {memo.viewCount.toLocaleString(i18n.language)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircleIcon className="size-3.5" />
              {t("memo.blog-comments", { n: commentAmount })}
            </span>
            {memo.attachments.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <PaperclipIcon className="size-3.5" />
                {t("memo.blog-attachments", { n: memo.attachments.length })}
              </span>
            )}
          </footer>
        </div>
        {coverLink}
      </div>
    </article>
  );
};

export default Blog2MemoView;
