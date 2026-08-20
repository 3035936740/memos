import copy from "copy-to-clipboard";
import { ExternalLinkIcon, FlagIcon } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "react-hot-toast";
import { useParams, useSearchParams } from "react-router-dom";
import MemoView from "@/components/MemoView";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import ReportDialog from "@/components/ReportDialog";
import UserAvatar from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useUser } from "@/hooks/useUserQueries";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { lazyWithReload } from "@/utils/lazy";
import { reportTarget } from "@/utils/moderation";

type TabView = "memos" | "map";

const UserMemoMap = lazyWithReload(() => import("@/components/UserMemoMap"));

interface User {
  name: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  description?: string;
}

const ProfileHeader = ({
  user,
  onCopyProfileLink,
  shareLabel,
  onReport,
  reportLabel,
}: {
  user: User;
  onCopyProfileLink: () => void;
  shareLabel: string;
  onReport?: () => void;
  reportLabel: string;
}) => (
  <div className="border-b border-border/10 px-4 py-8 sm:px-6">
    <div className="mx-auto flex w-full max-w-6xl gap-4 sm:gap-6">
      <UserAvatar className="h-20 w-20 shrink-0 rounded-2xl shadow-sm sm:h-24 sm:w-24" avatarUrl={user.avatarUrl} />
      <div className="flex flex-1 flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{user.displayName || user.username}</h1>
          {user.displayName && <p className="text-sm text-muted-foreground">@{user.username}</p>}
        </div>
        {user.description && <p className="text-sm text-foreground/70">{user.description}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onCopyProfileLink} className="w-fit gap-2">
            <ExternalLinkIcon className="h-4 w-4" />
            {shareLabel}
          </Button>
          {onReport ? (
            <Button variant="ghost" size="sm" onClick={onReport} className="w-fit gap-2 text-muted-foreground">
              <FlagIcon className="h-4 w-4" />
              {reportLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  </div>
);

const UserProfile = () => {
  const t = useTranslate();
  const username = useParams().username;
  const currentUser = useCurrentUser();
  const [searchParams] = useSearchParams();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const activeTab = (searchParams.get("view") === "map" ? "map" : "memos") as TabView;

  const { data: user, isLoading, error } = useUser(`users/${username}`, { enabled: !!username });

  if (error && !isLoading) {
    toast.error(t("message.user-not-found"));
  }

  const memoFilter = useMemoFilters({
    creatorName: user?.name,
    includeMemoViews: false,
    includePinned: true,
  });

  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: true,
    state: State.NORMAL,
  });

  const handleCopyProfileLink = () => {
    if (!user) return;
    copy(`${window.location.origin}/u/${encodeURIComponent(user.username)}`);
    toast.success(t("message.copied"));
  };

  const handleReport = async (reason: string) => {
    if (!user) return;
    try {
      await reportTarget("USER", user.name, reason);
      toast.success(t("moderation.reported"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("moderation.report-failed"));
      throw error;
    }
  };

  if (isLoading) return null;

  return (
    <section data-page-shell className="flex min-h-screen w-full flex-col bg-background">
      {user ? (
        <>
          <ProfileHeader
            user={user}
            onCopyProfileLink={handleCopyProfileLink}
            shareLabel={t("common.share")}
            reportLabel={t("moderation.report")}
            onReport={currentUser && currentUser.name !== user.name ? () => setReportDialogOpen(true) : undefined}
          />

          <div className="mt-4 flex-1">
            <div className="mx-auto w-full">
              {activeTab === "memos" ? (
                <PagedMemoList
                  renderer={(memo: Memo, { compact, parentPage }) => (
                    <MemoView key={getMemoKey(memo)} memo={memo} parentPage={parentPage} showVisibility showPinned compact={compact} />
                  )}
                  listSort={listSort}
                  orderBy={orderBy}
                  filter={memoFilter}
                />
              ) : (
                <div className="">
                  <Suspense fallback={<div className="h-[60dvh] sm:h-[500px] rounded-xl border border-border bg-muted/30" />}>
                    <UserMemoMap creator={user.name} className="h-[60dvh] sm:h-[500px] rounded-xl" />
                  </Suspense>
                </div>
              )}
            </div>
          </div>
          <ReportDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen} onSubmit={handleReport} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">{t("message.user-not-found")}</p>
        </div>
      )}
    </section>
  );
};

export default UserProfile;
