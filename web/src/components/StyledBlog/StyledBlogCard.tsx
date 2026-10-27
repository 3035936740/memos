import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  BanIcon,
  CalendarClockIcon,
  Clock3Icon,
  EyeIcon,
  EyeOffIcon,
  FilePenLineIcon,
  MessageCircleIcon,
  PaperclipIcon,
  PinIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deriveBlogMemoText } from "@/components/BlogMemoView";
import { useResolvedUser } from "@/components/MemoContent/MentionResolutionContext";
import PollCard from "@/components/MemoView/components/PollCard";
import { computeCommentAmount } from "@/components/MemoView/MemoViewContext";
import RelativeTime from "@/components/RelativeTime";
import UserAvatar from "@/components/UserAvatar";
import VideoPoster from "@/components/VideoPoster";
import useCurrentUser from "@/hooks/useCurrentUser";
import i18n from "@/i18n";
import type { MemoNavigationScope } from "@/lib/memo-navigation";
import { extractUsernameFromName } from "@/lib/resource-names";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { getAttachmentType, isMotionAttachment } from "@/utils/attachment";
import { bumpCounter, discover } from "@/utils/blog-progress";
import { useTranslate } from "@/utils/i18n";
import { buildAttachmentVisualItems, selectBlogCoverMedia } from "@/utils/media-item";
import { estimateReadingMinutes } from "@/utils/reading-time";
import { tagItemsOf } from "@/utils/tag-items";
import { isSuperUser } from "@/utils/user";
import WalkingCat from "./WalkingCat";

const CHIP_CLASSES = "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium leading-none";
const COVER_MEDIA_CLASSES =
  "absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transition-none";
// Stretched link: the whole card opens the article; the author link and the poll sit above it.
const STRETCHED_LINK_CLASSES =
  "after:absolute after:inset-0 after:z-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring/60";

interface Props {
  memo: Memo;
  showCreator?: boolean;
  parentPage?: string;
  navigationScope?: MemoNavigationScope;
  /** A rare gold "shiny" card, rolled by the list; opening it counts toward the codex. */
  shiny?: boolean;
}

/** A post card for the styled Blog 2 layout. The markup is shared; each style restyles it in CSS. */
const StyledBlogCard = ({ memo, showCreator = false, parentPage, navigationScope, shiny = false }: Props) => {
  const t = useTranslate();
  const [coverFailed, setCoverFailed] = useState(false);
  const currentUser = useCurrentUser();
  const anonymousForViewer = memo.anonymous && !isSuperUser(currentUser);
  const shouldShowCreator = !anonymousForViewer && (showCreator || Boolean(memo.creator));
  const creator = useResolvedUser(memo.creator, { enabled: shouldShowCreator });
  const { title, excerpt } = useMemo(
    () => deriveBlogMemoText(memo.content, memo.property?.title, memo.poll?.question),
    [memo.content, memo.property?.title, memo.poll?.question],
  );
  const cover = useMemo(() => {
    const pollImages = new Set([memo.poll?.image?.name, ...(memo.poll?.options.map((option) => option.image?.name) ?? [])]);
    const visualAttachments = memo.attachments.filter((attachment) => {
      if (pollImages.has(attachment.name)) return false;
      const type = getAttachmentType(attachment);
      return type === "image/*" || type === "video/*" || isMotionAttachment(attachment);
    });
    return selectBlogCoverMedia(memo.content, buildAttachmentVisualItems(visualAttachments));
  }, [memo.attachments, memo.content, memo.poll]);
  const readingMinutes = useMemo(() => estimateReadingMinutes(memo.content), [memo.content]);
  // Pinned posts carry a label for styles that annotate them (the hand-drawn "must read" note).
  const pinnedNote = memo.pinned ? t("blog-extra.must-read") : undefined;
  const items = useMemo(() => tagItemsOf(memo.tags), [memo.tags]);
  const createTime = !memo.hideTime && memo.createTime ? timestampDate(memo.createTime) : undefined;
  const commentAmount = computeCommentAmount(memo);
  const creatorUsername = creator?.username || extractUsernameFromName(memo.creator);
  const creatorLabel = creator?.displayName || creatorUsername;
  const visibleCover = coverFailed ? undefined : cover;

  useEffect(() => {
    setCoverFailed(false);
  }, [cover?.posterUrl]);

  return (
    <article
      data-sb-card=""
      data-sb-pinned={pinnedNote}
      data-sb-items={items.length > 0 ? items.join(" ") : undefined}
      data-sb-shiny={shiny || undefined}
      onClickCapture={() => {
        if (!shiny) return;
        bumpCounter("shinies");
        discover("shiny");
      }}
      className="group relative isolate flow-root min-w-0 px-5 py-4 text-card-foreground sm:px-6 sm:py-5"
    >
      {/* Tag items: a cat strolls by on hover and travel posts carry a postmark. Rain belongs to article reading view. */}
      {items.includes("cat") && <WalkingCat />}
      {items.includes("travel") && <span data-sb-stamp="" aria-hidden className="pointer-events-none absolute end-3 top-3 -z-10 size-16" />}
      {visibleCover && (
        // Decorative cover floated right, the summary wrapping beside it; clicks reach the title link.
        <div
          data-sb-cover=""
          aria-hidden
          className="pointer-events-none relative float-right mb-2 ms-4 aspect-[4/3] w-24 overflow-hidden rounded-xl bg-muted sm:w-38"
        >
          {visibleCover.kind === "video" ? (
            <VideoPoster
              sourceUrl={visibleCover.sourceUrl}
              posterUrl={visibleCover.posterUrl}
              alt={visibleCover.filename}
              className={COVER_MEDIA_CLASSES}
            />
          ) : (
            <img src={visibleCover.posterUrl} alt="" className={COVER_MEDIA_CLASSES} loading="lazy" onError={() => setCoverFailed(true)} />
          )}
        </div>
      )}

      <div data-sb-meta="" className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {shouldShowCreator && creatorLabel && (
          <Link
            to={`/u/${encodeURIComponent(creatorUsername)}`}
            className="relative z-10 flex min-w-0 items-center gap-2 font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            <UserAvatar avatarUrl={creator?.avatarUrl} className="size-6 rounded-full" />
            <span className="max-w-32 truncate">{creatorLabel}</span>
          </Link>
        )}
        {createTime && <RelativeTime date={createTime} />}
        {memo.pinned && (
          <span data-sb-chip="" className={cn(CHIP_CLASSES, "bg-primary text-primary-foreground")}>
            <PinIcon className="size-3" />
            {t("common.pinned")}
          </span>
        )}
        {memo.draft && (
          <span data-sb-chip="" className={cn(CHIP_CLASSES, "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>
            {memo.publishTime ? <CalendarClockIcon className="size-3" /> : <FilePenLineIcon className="size-3" />}
            {memo.publishTime ? t("memo.publication.scheduled") : t("memo.publication.draft")}
          </span>
        )}
        {memo.hidden && (
          <span data-sb-chip="" className={cn(CHIP_CLASSES, "bg-muted text-muted-foreground")}>
            <EyeOffIcon className="size-3" />
            {t("memo.hidden.label")}
          </span>
        )}
        {memo.quarantined && (
          <span data-sb-chip="" className={cn(CHIP_CLASSES, "bg-destructive/10 text-destructive")}>
            <BanIcon className="size-3" />
            {t("moderation.quarantined")}
          </span>
        )}
      </div>

      <h2 data-sb-title="" className="mt-2.5 line-clamp-2 text-lg font-semibold leading-snug text-foreground">
        <Link to={`/${memo.name}`} state={{ from: parentPage, navigationScope }} className={STRETCHED_LINK_CLASSES}>
          {title || t("memo.blog-untitled")}
        </Link>
      </h2>

      {/* Three actual line heights keep every line intact across styles while preserving cover wrapping. */}
      {excerpt.trim() && (
        <p data-sb-excerpt="" className="mt-1.5 max-h-[3lh] overflow-clip break-words text-sm leading-[1.75] text-muted-foreground">
          {excerpt}
        </p>
      )}

      {memo.poll && (
        <div className="relative z-10 mt-3 clear-both">
          <PollCard memo={memo} compact />
        </div>
      )}

      <div data-sb-footer="" className="clear-both mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {memo.tags.slice(0, 3).map((tag) => (
          <span key={tag} data-sb-tag="" className="max-w-32 truncate text-primary">
            #{tag}
          </span>
        ))}
        <span data-sb-stats="" className="ms-auto inline-flex items-center gap-3 tabular-nums">
          <span data-sb-reading-time="" className="inline-flex items-center gap-1">
            <Clock3Icon className="size-3.5" />
            {t("blog-extra.reading-time", { n: readingMinutes })}
          </span>
          <span className="inline-flex items-center gap-1" title={t("common.view-count")}>
            <EyeIcon className="size-3.5" />
            {memo.viewCount.toLocaleString(i18n.language)}
          </span>
          <span className="inline-flex items-center gap-1" title={t("memo.blog-comments", { n: commentAmount })}>
            <MessageCircleIcon className="size-3.5" />
            {commentAmount.toLocaleString(i18n.language)}
          </span>
          {memo.attachments.length > 0 && (
            <span className="inline-flex items-center gap-1" title={t("memo.blog-attachments", { n: memo.attachments.length })}>
              <PaperclipIcon className="size-3.5" />
              {memo.attachments.length.toLocaleString(i18n.language)}
            </span>
          )}
        </span>
      </div>
    </article>
  );
};

export default StyledBlogCard;
