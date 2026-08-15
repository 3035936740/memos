import { timestampDate } from "@bufbuild/protobuf/wkt";
import { MessageCircleIcon, PaperclipIcon, PinIcon } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useResolvedUser } from "@/components/MemoContent/MentionResolutionContext";
import RelativeTime from "@/components/RelativeTime";
import UserAvatar from "@/components/UserAvatar";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { getAttachmentType, isMotionAttachment } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";
import { buildAttachmentVisualItems } from "@/utils/media-item";
import { computeCommentAmount } from "./MemoView/MemoViewContext";

const TITLE_LIMIT = 72;
const EXCERPT_LIMIT = 180;

const truncateText = (value: string, limit: number) => {
  const characters = Array.from(value.trim());
  return characters.length > limit ? `${characters.slice(0, limit).join("")}\u2026` : characters.join("");
};

const markdownToPlainText = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+\.)\s+/gm, "")
    .replace(/[`*_~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const deriveBlogMemoText = (content: string, propertyTitle?: string) => {
  const lines = content.replace(/```[\s\S]*?```/g, " ").split(/\r?\n/);
  const explicitTitle = propertyTitle?.trim();
  let titleLineIndex = -1;
  let title = explicitTitle ?? "";

  for (let index = 0; index < lines.length; index += 1) {
    const plainLine = markdownToPlainText(lines[index] ?? "");
    if (!plainLine) continue;
    if (!title) {
      title = plainLine;
      titleLineIndex = index;
      break;
    }
    if (plainLine === explicitTitle) {
      titleLineIndex = index;
      break;
    }
  }

  const excerptSource = lines.filter((_, index) => index !== titleLineIndex).join("\n");
  let excerpt = markdownToPlainText(excerptSource);
  if (title && excerpt.startsWith(title)) excerpt = excerpt.slice(title.length).trim();

  return {
    title: truncateText(title, TITLE_LIMIT),
    excerpt: truncateText(excerpt, EXCERPT_LIMIT),
  };
};

interface Props {
  memo: Memo;
  showCreator?: boolean;
  parentPage?: string;
}

const BlogMemoView = ({ memo, showCreator = false, parentPage }: Props) => {
  const t = useTranslate();
  const creator = useResolvedUser(memo.creator, { enabled: showCreator });
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
  const creatorLabel = creator?.displayName || creator?.username;

  return (
    <article className="group mb-3 w-full overflow-hidden rounded-lg border border-border bg-card text-card-foreground transition-colors hover:border-border/90 hover:bg-card/95">
      <div className="p-4 sm:p-5">
        <div className="flex min-w-0 gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex min-h-5 flex-wrap items-center gap-1.5">
              {memo.pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <PinIcon className="size-3" />
                  {t("common.pinned")}
                </span>
              )}
              {memo.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded-full bg-muted/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                  #{tag}
                </span>
              ))}
              {memo.tags.length === 0 && (
                <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[11px] text-muted-foreground">{t("memo.blog-dynamic")}</span>
              )}
            </div>

            <Link
              to={detailPath}
              state={{ from: parentPage }}
              className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <h2 className="line-clamp-2 text-lg font-semibold leading-7 tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-xl">
                {title || t("memo.blog-untitled")}
              </h2>
            </Link>
            {excerpt && <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{excerpt}</p>}
          </div>

          {cover && (
            <Link
              to={detailPath}
              state={{ from: parentPage }}
              aria-label={title || t("memo.blog-untitled")}
              className="h-24 w-28 shrink-0 overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:w-36"
            >
              <img
                src={cover.posterUrl}
                alt=""
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                loading="lazy"
              />
            </Link>
          )}
        </div>

        <footer className="mt-4 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
          {showCreator && creatorLabel && (
            <Link
              to={`/u/${encodeURIComponent(creator?.username ?? "")}`}
              className="flex min-w-0 items-center gap-1.5 hover:text-foreground"
            >
              <UserAvatar avatarUrl={creator?.avatarUrl} className="size-5 rounded-md" />
              <span className="max-w-28 truncate">{creatorLabel}</span>
            </Link>
          )}
          {createTime && <RelativeTime date={createTime} />}
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
    </article>
  );
};

export default BlogMemoView;
