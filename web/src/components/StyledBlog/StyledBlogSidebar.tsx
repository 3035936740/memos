import { timestampDate } from "@bufbuild/protobuf/wkt";
import { HistoryIcon, InfoIcon, MessageSquareReplyIcon, PinIcon, ShuffleIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { deriveBlogMemoText } from "@/components/BlogMemoView";
import { BlogTagCloudWidget } from "@/components/AppSidebar";
import { deriveBlogSidebarStats } from "@/components/BlogSidebar";
import RelativeTime from "@/components/RelativeTime";
import { useAuth } from "@/contexts/AuthContext";
import { useMemos } from "@/hooks/useMemoQueries";
import { useAllUserStats } from "@/hooks/useUserQueries";
import type { MemoNavigationScope } from "@/lib/memo-navigation";
import { extractMemoIdFromName } from "@/lib/resource-names";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import { useRandomBlogMemo, useRecentBlogComments } from "@/utils/blog-sidebar";
import { useTranslate } from "@/utils/i18n";

const TIME_MACHINE_SIZE = 4;
const PINNED_ARTICLE_SIZE = 5;

const WIDGET_CLASSES = "min-w-0 px-[18px] py-4";
const WIDGET_TITLE_CLASSES = "mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-foreground";
const LINK_TEXT_CLASSES = "text-[13px] leading-5 text-foreground/90 transition-colors hover:text-primary";

interface Props {
  state?: State;
  orderBy?: string;
  filter?: string;
  parentPage: string;
  className?: string;
}

/** The widget column of the styled Blog 2 layout: one card per widget, in the order a blog theme lists them. */
const StyledBlogSidebar = ({ state = State.NORMAL, orderBy = "create_time desc", filter, parentPage, className }: Props) => {
  const t = useTranslate();
  const { currentUser } = useAuth();
  const viewerKey = currentUser?.name ?? "guest";
  const { data: recentData } = useMemos({ state, orderBy, filter, pageSize: TIME_MACHINE_SIZE });
  const pinnedFilter = filter ? `(${filter}) && pinned` : "pinned";
  const { data: pinnedData } = useMemos({ state, orderBy, filter: pinnedFilter, pageSize: PINNED_ARTICLE_SIZE });
  const { data: userStats = [] } = useAllUserStats({ state, filter });
  const { data: recentComments = [] } = useRecentBlogComments(viewerKey, filter);
  const randomMemo = useRandomBlogMemo(viewerKey, filter);
  const stats = deriveBlogSidebarStats(userStats);
  const navigationScope: MemoNavigationScope = { state, orderBy, filter };
  const randomNavigationScope: MemoNavigationScope = { state: State.NORMAL, orderBy: "create_time desc", filter };
  const pinnedMemos = pinnedData?.memos ?? [];

  const statRows = [
    { label: t("memo.blog-sidebar-articles"), value: stats.articleCount.toLocaleString() },
    { label: t("memo.blog-sidebar-comments"), value: stats.commentCount.toLocaleString() },
    { label: t("memo.blog-sidebar-running-days"), value: t("memo.blog-sidebar-days", { n: stats.runningDays }) },
    { label: t("memo.blog-sidebar-last-activity"), value: stats.lastActiveAt ? <RelativeTime date={stats.lastActiveAt} /> : "—" },
  ];

  return (
    <div data-blog-sidebar="" data-sb-sidebar="" className={cn("flex flex-col gap-[1.125rem]", className)}>
      {pinnedMemos.length > 0 && (
        <section data-sb-widget="" className={WIDGET_CLASSES}>
          <h2 data-sb-widget-title="" className={WIDGET_TITLE_CLASSES}>
            <PinIcon className="size-3.5" />
            {t("memo.blog-sidebar-pinned-articles")}
          </h2>
          <ul className="flex flex-col gap-2">
            {pinnedMemos.map((memo) => (
              <li key={memo.name} data-sb-item="">
                <Link to={`/${memo.name}`} state={{ from: parentPage, navigationScope }} className={cn("line-clamp-2", LINK_TEXT_CLASSES)}>
                  {deriveBlogMemoText(memo.content, memo.property?.title).title || t("memo.blog-untitled")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section data-sb-widget="" className={WIDGET_CLASSES}>
        <h2 data-sb-widget-title="" className={WIDGET_TITLE_CLASSES}>
          <HistoryIcon className="size-3.5" />
          {t("memo.blog-sidebar-time-machine")}
        </h2>
        <ol className="flex flex-col gap-3">
          {(recentData?.memos ?? []).map((memo) => {
            const createTime = memo.createTime && !memo.hideTime ? timestampDate(memo.createTime) : undefined;
            return (
              <li key={memo.name} data-sb-item="">
                {createTime && (
                  <div className="text-[11px] text-muted-foreground">
                    <RelativeTime date={createTime} />
                  </div>
                )}
                <Link to={`/${memo.name}`} state={{ from: parentPage, navigationScope }} className={cn("line-clamp-2", LINK_TEXT_CLASSES)}>
                  {deriveBlogMemoText(memo.content, memo.property?.title).title || t("memo.blog-untitled")}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {recentComments.length > 0 && (
        <section data-sb-widget="" className={WIDGET_CLASSES}>
          <h2 data-sb-widget-title="" className={WIDGET_TITLE_CLASSES}>
            <MessageSquareReplyIcon className="size-3.5" />
            {t("memo.blog-sidebar-recent-comments")}
          </h2>
          <ul className="flex flex-col gap-3">
            {recentComments.map((comment) => (
              <li key={comment.name} data-sb-item="">
                <Link
                  to={`/${comment.parentName}#${extractMemoIdFromName(comment.name)}`}
                  state={{ from: parentPage, commentTarget: extractMemoIdFromName(comment.name) }}
                  className="group/comment block"
                >
                  <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{comment.creator ? `@${comment.creator}` : "—"}</span>
                    <span className="shrink-0">
                      <RelativeTime date={new Date(comment.createTime * 1000)} />
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] leading-5 text-foreground/90 transition-colors group-hover/comment:text-primary">
                    {comment.content}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {randomMemo && (
        <section data-sb-widget="" className={WIDGET_CLASSES}>
          <h2 data-sb-widget-title="" className={WIDGET_TITLE_CLASSES}>
            <ShuffleIcon className="size-3.5" />
            {t("memo.blog-sidebar-random-memo")}
          </h2>
          <Link
            to={`/${randomMemo.name}`}
            state={{ from: parentPage, navigationScope: randomNavigationScope }}
            className="block text-[13px] font-semibold leading-5 text-foreground/90 transition-colors hover:text-primary"
          >
            <span className="line-clamp-2">
              {deriveBlogMemoText(randomMemo.content, randomMemo.property?.title).title || t("memo.blog-untitled")}
            </span>
          </Link>
        </section>
      )}

      <section data-sb-widget="" className={WIDGET_CLASSES}>
        <h2 data-sb-widget-title="" className={WIDGET_TITLE_CLASSES}>
          <InfoIcon className="size-3.5" />
          {t("memo.blog-sidebar-info")}
        </h2>
        <dl className="flex flex-col gap-2">
          {statRows.map(({ label, value }) => (
            <div key={label} className="flex min-w-0 items-center justify-between gap-3 text-xs">
              <dt className="truncate text-muted-foreground">{label}</dt>
              <dd className="shrink-0 text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <BlogTagCloudWidget widgetClassName={WIDGET_CLASSES} titleClassName={WIDGET_TITLE_CLASSES} />
    </div>
  );
};

export default StyledBlogSidebar;
