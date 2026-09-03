import { CheckCircle2Icon, Clock3Icon, ListChecksIcon, Loader2Icon, LogInIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PreviewImageDialog from "@/components/PreviewImageDialog";
import UserAvatar from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import useCurrentUser from "@/hooks/useCurrentUser";
import { usePollQueries } from "@/hooks/usePollQueries";
import { cn } from "@/lib/utils";
import { type Memo, VoterType } from "@/types/proto/api/v1/memo_service_pb";
import { getAttachmentUrl } from "@/utils/attachment";
import { buildAuthRoute } from "@/utils/redirect-safety";

const dateValue = (seconds?: bigint) => (seconds ? new Date(Number(seconds) * 1000) : undefined);

const PollCard = ({ memo, compact = false }: { memo: Memo; compact?: boolean }) => {
  const currentUser = useCurrentUser();
  const location = useLocation();
  const { poll: activePoll, vote } = usePollQueries(memo, currentUser?.name);
  const [selected, setSelected] = useState<string[]>(memo.poll?.selectedOptionIds ?? []);
  const [isVoting, setIsVoting] = useState(false);
  const [voteError, setVoteError] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const imageURLs = useMemo(() => {
    const images = [activePoll?.image, ...(activePoll?.options.map((option) => option.image) ?? [])];
    return images.flatMap((image) => (image ? [getAttachmentUrl(image)] : []));
  }, [activePoll]);
  const needsLogin = !currentUser && activePoll?.voterType !== VoterType.ANYONE;

  useEffect(() => {
    setSelected(activePoll?.selectedOptionIds ?? []);
  }, [activePoll]);

  const status = useMemo(() => {
    if (!activePoll) return "missing";
    const now = Date.now();
    const start = dateValue(activePoll.startTime?.seconds)?.getTime();
    const end = dateValue(activePoll.endTime?.seconds)?.getTime();
    if (start && now < start) return "upcoming";
    if (end && now >= end) return "ended";
    return "open";
  }, [activePoll]);

  const handleVote = async () => {
    if (!activePoll || needsLogin || selected.length === 0 || isVoting) return;
    setIsVoting(true);
    setVoteError(false);
    try {
      const result = await vote.mutateAsync(selected);
      setSelected(result.selectedOptionIds);
    } catch {
      setVoteError(true);
    } finally {
      setIsVoting(false);
    }
  };

  if (!activePoll) return null;
  const hasVoted = activePoll.selectedOptionIds.length > 0;
  const disabled = status !== "open" || isVoting || hasVoted || needsLogin;
  const total = activePoll.options.reduce((sum, option) => sum + option.voteCount, 0);
  const maxSelections = activePoll.allowMultiple ? activePoll.maxSelections || activePoll.options.length : 1;

  const toggleOption = (id: string) => {
    if (disabled) return;
    if (!activePoll.allowMultiple) {
      setSelected([id]);
      return;
    }
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : current.length < maxSelections ? [...current, id] : current,
    );
  };

  return (
    <section
      className={cn("w-full self-center rounded-lg border border-border bg-card", compact ? "p-3" : "max-w-xl p-4")}
      aria-label="Poll"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <ListChecksIcon className="size-4" />
        投票
      </div>
      <div className="text-base font-medium">{activePoll.question}</div>
      {activePoll.image && (
        <button
          type="button"
          className="mt-3 block w-full cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="查看投票图片"
          onClick={(event) => {
            event.stopPropagation();
            setPreviewIndex(0);
          }}
        >
          <img
            src={getAttachmentUrl(activePoll.image)}
            alt=""
            className={cn("w-full rounded-md object-cover", compact ? "max-h-40" : "max-h-64")}
            loading="lazy"
          />
        </button>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {activePoll.options.map((option) => {
          const percentage = total > 0 ? Math.round((option.voteCount / total) * 100) : 0;
          const checked = selected.includes(option.id);
          const imageURL = option.image ? getAttachmentUrl(option.image) : undefined;
          return (
            <div key={option.id} className="relative overflow-hidden rounded-md border border-border p-3 text-left">
              {!activePoll.resultsHidden && (
                <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${percentage}%` }} />
              )}
              <button
                type="button"
                disabled={disabled}
                aria-label={option.text}
                aria-pressed={checked}
                onClick={() => toggleOption(option.id)}
                className="absolute inset-0 rounded-md disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
              <span className="pointer-events-none relative flex items-center gap-2 text-sm">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground">
                  {checked && <span className="size-2 rounded-full bg-primary" />}
                </span>
                {imageURL && (
                  <button
                    type="button"
                    aria-label={`查看选项图片：${option.text}`}
                    className="pointer-events-auto shrink-0 cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPreviewIndex(imageURLs.indexOf(imageURL));
                    }}
                  >
                    <img src={imageURL} alt="" className="size-10 rounded-md object-cover" loading="lazy" />
                  </button>
                )}
                {option.text}
                {!activePoll.resultsHidden && <span className="ml-auto text-xs text-muted-foreground">{percentage}%</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{activePoll.allowMultiple ? `最多选择 ${maxSelections} 项` : "单选"}</span>
        <span>·</span>
        <span>{activePoll.voterType === VoterType.ANYONE ? "游客可投票" : "仅登录用户"}</span>
        {status === "upcoming" && (
          <>
            <span>·</span>
            <Clock3Icon className="size-3.5" />
            <span>尚未开始</span>
          </>
        )}
        {status === "ended" && (
          <>
            <span>·</span>
            <CheckCircle2Icon className="size-3.5" />
            <span>已结束</span>
          </>
        )}
        <span className="ml-auto">{activePoll.resultsHidden ? "投票后可查看票数和比例" : `${total} 票`}</span>
      </div>
      {activePoll.votersVisible && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">投票用户</p>
          <div className="flex flex-wrap gap-2">
            {activePoll.voters.slice(0, 10).map((voter) => (
              <Popover key={voter.name}>
                <PopoverTrigger
                  aria-label={`${voter.displayName || voter.username} (@${voter.username})`}
                  title={`${voter.displayName || voter.username} (@${voter.username})`}
                  className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserAvatar avatarUrl={voter.avatarUrl} />
                </PopoverTrigger>
                <PopoverContent className="p-3">
                  <p className="text-sm font-medium">{voter.displayName || voter.username}</p>
                  <p className="text-xs text-muted-foreground">@{voter.username}</p>
                  {activePoll.showVoterChoices && voter.selectedOptionIds.length > 0 && (
                    <div className="mt-2 max-w-64 border-t pt-2 text-sm">
                      <p className="mb-1 text-xs text-muted-foreground">所选选项</p>
                      <ul className="list-inside list-disc break-words">
                        {activePoll.options
                          .filter((option) => voter.selectedOptionIds.includes(option.id))
                          .map((option) => (
                            <li key={option.id}>{option.text}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            ))}
            {(activePoll.hasMoreVoters || activePoll.voters.length > 10) && (
              <span
                className="flex size-8 items-center justify-center text-muted-foreground"
                title="仅随机展示 10 位投票用户"
                aria-label="还有其他投票用户，仅随机展示 10 位"
              >
                …
              </span>
            )}
            {activePoll.voters.length === 0 && <span className="text-xs text-muted-foreground">暂无投票用户</span>}
          </div>
        </div>
      )}
      {status === "open" && !hasVoted && needsLogin && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
          <p className="text-sm text-muted-foreground">此投票仅限登录用户参与，请先登录。</p>
          <Button render={<Link to={buildAuthRoute({ redirect: `${location.pathname}${location.search}${location.hash}` })} />}>
            <LogInIcon className="size-4" />
            登录后投票
          </Button>
        </div>
      )}
      {status === "open" && !hasVoted && !needsLogin && (
        <Button className="mt-3" disabled={selected.length === 0 || isVoting} onClick={() => void handleVote()}>
          {isVoting && <Loader2Icon className="size-4 animate-spin" />}投票
        </Button>
      )}
      {hasVoted && (
        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <CheckCircle2Icon className="size-3.5" />
          已投票
        </div>
      )}
      {voteError && !needsLogin && (
        <div role="alert" className="mt-2 text-xs text-destructive">
          投票失败，请稍后重试。
        </div>
      )}
      {previewIndex !== null && (
        <PreviewImageDialog open onOpenChange={(open) => !open && setPreviewIndex(null)} imgUrls={imageURLs} initialIndex={previewIndex} />
      )}
    </section>
  );
};

export default PollCard;
