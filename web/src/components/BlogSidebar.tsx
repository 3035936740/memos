import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  ActivityIcon,
  CalendarDaysIcon,
  HistoryIcon,
  MessageCircleIcon,
  MessageSquareReplyIcon,
  NotebookTextIcon,
  PinIcon,
  ShuffleIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { deriveBlogMemoText } from "@/components/BlogMemoView";
import RelativeTime from "@/components/RelativeTime";
import { useAuth } from "@/contexts/AuthContext";
import { useMemos } from "@/hooks/useMemoQueries";
import { useAllUserStats } from "@/hooks/useUserQueries";
import type { MemoNavigationScope } from "@/lib/memo-navigation";
import { extractMemoIdFromName } from "@/lib/resource-names";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import type { UserStats } from "@/types/proto/api/v1/user_service_pb";
import { useRandomBlogMemo, useRecentBlogComments } from "@/utils/blog-sidebar";
import { useTranslate } from "@/utils/i18n";

const TIME_MACHINE_SIZE = 4;
const PINNED_ARTICLE_SIZE = 5;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const deriveBlogSidebarStats = (stats: UserStats[], now = new Date()) => {
  const createdTimes = stats.flatMap((item) => item.memoCreatedTimestamps.map((timestamp) => timestampDate(timestamp).getTime()));
  const updatedTimes = stats.flatMap((item) => item.memoUpdatedTimestamps.map((timestamp) => timestampDate(timestamp).getTime()));
  const firstCreatedAt = createdTimes.length > 0 ? new Date(Math.min(...createdTimes)) : undefined;
  const lastActiveAt = updatedTimes.length > 0 ? new Date(Math.max(...updatedTimes)) : undefined;
  const runningDays = firstCreatedAt ? Math.max(1, Math.floor((now.getTime() - firstCreatedAt.getTime()) / DAY_IN_MS) + 1) : 0;

  return {
    articleCount: stats.reduce((total, item) => total + item.totalMemoCount, 0),
    commentCount: stats.reduce((total, item) => total + item.totalCommentCount, 0),
    runningDays,
    lastActiveAt,
  };
};

interface Props {
  state?: State;
  orderBy?: string;
  filter?: string;
  parentPage: string;
  className?: string;
}

const BlogSidebar = ({ state = State.NORMAL, orderBy = "create_time desc", filter, parentPage, className }: Props) => {
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

  const statRows = [
    { label: t("memo.blog-sidebar-articles"), value: stats.articleCount.toLocaleString(), icon: NotebookTextIcon },
    { label: t("memo.blog-sidebar-comments"), value: stats.commentCount.toLocaleString(), icon: MessageCircleIcon },
    { label: t("memo.blog-sidebar-running-days"), value: t("memo.blog-sidebar-days", { n: stats.runningDays }), icon: CalendarDaysIcon },
    {
      label: t("memo.blog-sidebar-last-activity"),
      value: stats.lastActiveAt ? <RelativeTime date={stats.lastActiveAt} /> : "—",
      icon: ActivityIcon,
    },
  ];

  return (
    <div data-blog-sidebar="" className={cn("overflow-hidden rounded-lg border border-border bg-card text-card-foreground", className)}>
      <section className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <HistoryIcon className="size-4" />
          {t("memo.blog-sidebar-time-machine")}
        </h2>

        <div className="relative mt-4 space-y-4 before:absolute before:bottom-1 before:left-[3px] before:top-1 before:w-px before:bg-border">
          {(recentData?.memos ?? []).map((memo, index) => {
            const { title } = deriveBlogMemoText(memo.content, memo.property?.title);
            const createTime = memo.createTime ? timestampDate(memo.createTime) : undefined;
            return (
              <div key={memo.name} className="relative pl-5">
                <span
                  className={cn(
                    "absolute left-0 top-1.5 size-[7px] rounded-full border-2 border-card ring-1",
                    index % 3 === 0
                      ? "bg-sky-400 ring-sky-400"
                      : index % 3 === 1
                        ? "bg-violet-400 ring-violet-400"
                        : "bg-emerald-400 ring-emerald-400",
                  )}
                />
                {createTime && (
                  <div className="mb-1 text-xs text-muted-foreground">
                    <RelativeTime date={createTime} />
                  </div>
                )}
                <Link
                  to={`/${memo.name}`}
                  state={{ from: parentPage, navigationScope }}
                  className="line-clamp-3 text-sm leading-5 text-foreground/85 transition-colors hover:text-primary"
                >
                  {title || t("memo.blog-untitled")}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {recentComments.length > 0 && (
        <section className="border-t border-border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquareReplyIcon className="size-4" />
            {t("memo.blog-sidebar-recent-comments")}
          </h2>
          <div className="mt-3 space-y-1.5">
            {recentComments.map((comment) => (
              <Link
                key={comment.name}
                to={`/${comment.parentName}#${extractMemoIdFromName(comment.name)}`}
                state={{ from: parentPage, commentTarget: extractMemoIdFromName(comment.name) }}
                className="block rounded-md px-2 py-2 transition-colors hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{comment.creator ? `@${comment.creator}` : "—"}</span>
                  <RelativeTime date={new Date(comment.createTime * 1000)} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-foreground/85">{comment.content}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {randomMemo && (
        <section className="border-t border-border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShuffleIcon className="size-4" />
            {t("memo.blog-sidebar-random-memo")}
          </h2>
          <Link
            to={`/${randomMemo.name}`}
            state={{ from: parentPage, navigationScope: randomNavigationScope }}
            className="mt-3 block rounded-md px-2 py-2 transition-colors hover:bg-muted hover:text-primary"
          >
            <span className="line-clamp-2 text-sm font-medium leading-5">
              {deriveBlogMemoText(randomMemo.content, randomMemo.property?.title).title || t("memo.blog-untitled")}
            </span>
          </Link>
        </section>
      )}

      {(pinnedData?.memos.length ?? 0) > 0 ? (
        <section className="border-t border-border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <PinIcon className="size-4" />
            {t("memo.blog-sidebar-pinned-articles")}
          </h2>
          <div className="mt-3 space-y-2">
            {pinnedData?.memos.map((memo) => {
              const { title } = deriveBlogMemoText(memo.content, memo.property?.title);
              return (
                <Link
                  key={memo.name}
                  to={`/${memo.name}`}
                  state={{ from: parentPage, navigationScope }}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-primary"
                >
                  <PinIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span className="line-clamp-2">{title || t("memo.blog-untitled")}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="border-t border-border bg-muted/20 p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t("memo.blog-sidebar-info")}</h2>
        <dl className="space-y-2.5">
          {statRows.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-background/60 px-2.5 py-2 text-xs">
              <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </dt>
              <dd className="shrink-0 text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
};

export default BlogSidebar;
