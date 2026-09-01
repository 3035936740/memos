import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import SpaceMark from "@/components/SpaceMark";
import UserAvatar from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useAcceptSpaceInvitation, useDeclineSpaceInvitation } from "@/hooks/useSpaceQueries";
import { userKeys } from "@/hooks/useUserQueries";
import { handleError } from "@/lib/error";
import { cn } from "@/lib/utils";
import type { UserNotification } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";

interface Props {
  notification: UserNotification;
}

const SpaceInvitationMessage = ({ notification }: Props) => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const acceptInvitation = useAcceptSpaceInvitation(currentUser?.name ?? "");
  const declineInvitation = useDeclineSpaceInvitation(currentUser?.name ?? "");
  const [decision, setDecision] = useState<"accept" | "decline">();
  const payload = notification.payload?.case === "spaceInvitation" ? notification.payload.value : undefined;
  const sender = notification.senderUser;
  const spaceUID = payload?.space.replace(/^spaces\//, "") ?? "";
  const isPending = acceptInvitation.isPending || declineInvitation.isPending;

  const removeFromNotificationCache = () => {
    queryClient.setQueryData<UserNotification[]>(userKeys.notifications(), (notifications) =>
      notifications?.filter((item) => item.name !== notification.name),
    );
  };

  const handleAccept = async () => {
    if (!payload || isPending) return;
    setDecision("accept");
    try {
      await acceptInvitation.mutateAsync({ name: payload.invitation });
      removeFromNotificationCache();
      toast.success(t("inbox.space-invitation-accepted", { space: payload.spaceTitle }));
    } catch (error) {
      handleError(error, toast.error, { context: "Accept space invitation notification" });
    } finally {
      setDecision(undefined);
    }
  };

  const handleDecline = async () => {
    if (!payload || isPending) return;
    setDecision("decline");
    try {
      await declineInvitation.mutateAsync({ name: payload.invitation });
      removeFromNotificationCache();
      toast.success(t("inbox.space-invitation-declined"));
    } catch (error) {
      handleError(error, toast.error, { context: "Decline space invitation notification" });
    } finally {
      setDecision(undefined);
    }
  };

  if (!payload) return null;

  return (
    <div className="group relative w-full border-b border-border/60 bg-primary/[0.03] px-5 py-4 last:border-b-0 hover:bg-primary/[0.06]">
      <div className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <UserAvatar className="size-10 ring-1 ring-border/40" avatarUrl={sender?.avatarUrl} />
          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-md">
            <UserPlusIcon className="size-2.5" strokeWidth={2.5} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-sm font-semibold text-foreground/95">{sender?.displayName || sender?.username}</span>
            <span className="text-sm text-muted-foreground">{t("inbox.invited-you-to-space")}</span>
            <span className="text-xs text-muted-foreground/70">
              {notification.createTime
                ? timestampDate(notification.createTime)?.toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : null}
            </span>
          </div>

          <Link
            to={`/space/${spaceUID}`}
            className="mt-3 flex min-w-0 items-center gap-3 rounded-lg border border-primary/25 bg-background/70 p-3 transition hover:border-primary/50 hover:bg-primary/[0.05]"
          >
            <SpaceMark size="lg" avatarUrl={payload.spaceAvatarUrl} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{payload.spaceTitle}</p>
              <p className={cn("mt-0.5 text-xs text-muted-foreground", payload.spaceDescription && "line-clamp-2")}>
                {payload.spaceDescription || t("setting.spaces.no-description")}
              </p>
            </div>
          </Link>

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => void handleDecline()}>
              <XIcon />
              {decision === "decline" ? `${t("setting.spaces.decline")}…` : t("setting.spaces.decline")}
            </Button>
            <Button size="sm" disabled={isPending} onClick={() => void handleAccept()}>
              <CheckIcon />
              {decision === "accept" ? `${t("setting.spaces.accept")}…` : t("setting.spaces.accept")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpaceInvitationMessage;
