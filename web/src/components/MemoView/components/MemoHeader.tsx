import { BanIcon, BookmarkIcon, CalendarClockIcon, EyeIcon, EyeOffIcon, FilePenLineIcon, MessageCircleIcon } from "lucide-react";
import { useCallback } from "react";
import { Link } from "react-router-dom";
import RelativeTime from "@/components/RelativeTime";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { memoServiceClient } from "@/connect";
import { useNewMemo } from "@/contexts/NewMemoContext";
import useNavigateTo from "@/hooks/useNavigateTo";
import i18n from "@/i18n";
import { Visibility } from "@/types/proto/api/v1/memo_service_pb";
import type { User } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";
import { convertVisibilityToString } from "@/utils/memo";
import MemoActionMenu from "../../MemoActionMenu";
import { ReactionSelector } from "../../MemoReactionListView";
import UserAvatar from "../../UserAvatar";
import VisibilityIcon from "../../VisibilityIcon";
import { useMemoActions } from "../hooks";
import { useMemoViewContext, useMemoViewDerived } from "../MemoViewContext";
import type { MemoHeaderProps } from "../types";

const MemoHeader: React.FC<MemoHeaderProps> = ({ showCreator, showVisibility, showPinned }) => {
  const t = useTranslate();

  const { memo, creator, currentUser, parentPage, navigationScope, isArchived, readonly, openEditor } = useMemoViewContext();
  const { createTime, updateTime, displayTime: memoDisplayTime, isDisplayingUpdatedTime, relativeTimeFormat } = useMemoViewDerived();
  const { newMemoName } = useNewMemo();

  const navigateTo = useNavigateTo();
  const handleGotoMemoDetailPage = useCallback(() => {
    navigateTo(`/${memo.name}`, { state: { from: parentPage, navigationScope } });
  }, [memo.name, navigationScope, parentPage, navigateTo]);
  const handleQuickReply = useCallback(async () => {
    let replyParentName = memo.name;
    if (memo.parent) {
      replyParentName = memo.parent;
      const visited = new Set([memo.name]);
      for (let depth = 0; depth < 20 && replyParentName && !visited.has(replyParentName); depth += 1) {
        visited.add(replyParentName);
        try {
          const parentMemo = await memoServiceClient.getMemo({ name: replyParentName });
          if (!parentMemo.parent) {
            replyParentName = parentMemo.name;
            break;
          }
          replyParentName = parentMemo.parent;
        } catch {
          break;
        }
      }
    }

    navigateTo(`/${replyParentName}#comments`, {
      state: {
        from: parentPage,
        navigationScope,
        quickReplyMemo: replyParentName,
        replyToMemo: memo.parent ? memo.name : undefined,
        quickReplyContent: memo.parent && creator?.username ? `@${creator.username} ` : undefined,
        quickReplyRequest: Date.now(),
      },
    });
  }, [creator?.username, memo.name, memo.parent, navigateTo, navigationScope, parentPage]);

  const { unpinMemo } = useMemoActions(memo);

  const timeValue = isArchived ? (
    memoDisplayTime?.toLocaleString(i18n.language)
  ) : (
    <RelativeTime date={memoDisplayTime} format={relativeTimeFormat} />
  );
  const displayTime = isDisplayingUpdatedTime ? (
    <>
      {t("common.last-updated-at")} {timeValue}
    </>
  ) : (
    timeValue
  );
  const timeTooltip = {
    createdAt: createTime ? `${t("common.created-at")}: ${createTime.toLocaleString(i18n.language)}` : undefined,
    updatedAt:
      updateTime && (!createTime || updateTime.getTime() !== createTime.getTime())
        ? `${t("common.last-updated-at")}: ${updateTime.toLocaleString(i18n.language)}`
        : undefined,
  };

  return (
    <div className="w-full flex flex-row justify-between items-center gap-2">
      <div className="w-auto max-w-[calc(100%-8rem)] grow flex flex-row justify-start items-center">
        {showCreator && creator ? (
          <CreatorDisplay creator={creator} displayTime={displayTime} timeTooltip={timeTooltip} onGotoDetail={handleGotoMemoDetailPage} />
        ) : (
          <TimeDisplay displayTime={displayTime} timeTooltip={timeTooltip} onGotoDetail={handleGotoMemoDetailPage} />
        )}
        {memo.name === newMemoName && (
          <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium leading-none text-primary">
            {t("memo.new-badge")}
          </span>
        )}
      </div>

      <div className="flex flex-row justify-end items-center select-none shrink-0 gap-2">
        {!memo.parent && (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex items-center gap-1 text-xs text-muted-foreground" />}>
              <EyeIcon className="size-4" />
              <span>{memo.viewCount.toLocaleString(i18n.language)}</span>
            </TooltipTrigger>
            <TooltipContent>{t("common.view-count")}</TooltipContent>
          </Tooltip>
        )}
        {memo.draft && (
          <Tooltip>
            <TooltipTrigger render={<span className="flex size-4 items-center justify-center text-amber-600" />}>
              {memo.publishTime ? <CalendarClockIcon className="size-4" /> : <FilePenLineIcon className="size-4" />}
            </TooltipTrigger>
            <TooltipContent>{memo.publishTime ? t("memo.publication.scheduled") : t("memo.publication.draft")}</TooltipContent>
          </Tooltip>
        )}
        {memo.hidden && (
          <Tooltip>
            <TooltipTrigger render={<span className="flex size-4 items-center justify-center text-muted-foreground" />}>
              <EyeOffIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{t("memo.hidden.label")}</TooltipContent>
          </Tooltip>
        )}
        {memo.quarantined && (
          <Tooltip>
            <TooltipTrigger render={<span className="flex size-4 items-center justify-center text-destructive" />}>
              <BanIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{t("moderation.quarantined")}</TooltipContent>
          </Tooltip>
        )}
        {currentUser && !isArchived && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={t("memo.comment.write-a-comment")}
                  className="flex size-4 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={handleQuickReply}
                />
              }
            >
              <MessageCircleIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{t("memo.comment.write-a-comment")}</TooltipContent>
          </Tooltip>
        )}

        {currentUser && !isArchived && <ReactionSelector className="block h-auto w-auto border-none" memo={memo} />}

        {showVisibility && memo.visibility !== Visibility.PRIVATE && (
          <Tooltip>
            <TooltipTrigger>
              <span className="flex justify-center items-center rounded-md hover:opacity-80">
                <VisibilityIcon visibility={memo.visibility} />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t(`memo.visibility.${convertVisibilityToString(memo.visibility).toLowerCase()}` as Parameters<typeof t>[0])}
            </TooltipContent>
          </Tooltip>
        )}

        {showPinned && memo.pinned && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-pointer" />}>
                <BookmarkIcon className="w-4 h-auto text-primary" onClick={unpinMemo} />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("common.unpin")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <MemoActionMenu memo={memo} readonly={readonly} onEdit={openEditor} />
      </div>
    </div>
  );
};

interface CreatorDisplayProps {
  creator: User;
  displayTime: React.ReactNode;
  timeTooltip: TimeTooltipContent;
  onGotoDetail: () => void;
}

const CreatorDisplay: React.FC<CreatorDisplayProps> = ({ creator, displayTime, timeTooltip, onGotoDetail }) => (
  <div className="w-full flex flex-row justify-start items-center">
    <Link className="w-auto hover:opacity-80 rounded-md transition-colors" to={`/u/${encodeURIComponent(creator.username)}`} viewTransition>
      <UserAvatar className="mr-2 shrink-0" avatarUrl={creator.avatarUrl} />
    </Link>
    <div className="w-full flex flex-col justify-center items-start">
      <Link
        className="block leading-tight hover:opacity-80 rounded-md transition-colors truncate text-muted-foreground"
        to={`/u/${encodeURIComponent(creator.username)}`}
        viewTransition
      >
        {creator.displayName || creator.username}
      </Link>
      <TimeTooltip content={timeTooltip}>
        <span
          className="w-auto -mt-0.5 text-xs leading-tight text-muted-foreground select-none cursor-pointer hover:opacity-80 transition-colors text-left"
          onClick={onGotoDetail}
        >
          {displayTime}
        </span>
      </TimeTooltip>
    </div>
  </div>
);

interface TimeTooltipContent {
  createdAt?: string;
  updatedAt?: string;
}

const TimeTooltip = ({ children, content }: { children: React.ReactElement; content: TimeTooltipContent }) => (
  <Tooltip>
    <TooltipTrigger render={children} />
    <TooltipContent align="start" className="flex flex-col items-start gap-0.5 whitespace-nowrap text-left">
      {content.createdAt && <span>{content.createdAt}</span>}
      {content.updatedAt && <span>{content.updatedAt}</span>}
    </TooltipContent>
  </Tooltip>
);

interface TimeDisplayProps {
  displayTime: React.ReactNode;
  timeTooltip: TimeTooltipContent;
  onGotoDetail: () => void;
}

const TimeDisplay: React.FC<TimeDisplayProps> = ({ displayTime, timeTooltip, onGotoDetail }) => (
  <TimeTooltip content={timeTooltip}>
    <span
      className="w-auto text-sm leading-tight text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors text-left"
      onClick={onGotoDetail}
    >
      {displayTime}
    </span>
  </TimeTooltip>
);

export default MemoHeader;
