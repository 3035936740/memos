import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import SettingSection from "@/components/Settings/SettingSection";
import SpaceMark from "@/components/SpaceMark";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { spaceServiceClient } from "@/connect";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useDeleteSpace } from "@/hooks/useSpaceQueries";
import { handleError } from "@/lib/error";
import { extractSpaceUidFromName } from "@/lib/space-display";
import { cn } from "@/lib/utils";
import { type Space, Space_AccessMode } from "@/types/proto/api/v1/space_service_pb";
import { useTranslate } from "@/utils/i18n";

const PAGE_SIZE = 10;

const AdminSpacesSection = () => {
  const t = useTranslate();
  const currentUserName = useCurrentUser()?.name ?? "";
  const queryClient = useQueryClient();
  const deleteSpace = useDeleteSpace(currentUserName);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageTokens, setPageTokens] = useState<string[]>([""]);
  const [deleteTarget, setDeleteTarget] = useState<Space>();
  const pageToken = pageTokens[page - 1] ?? "";
  const queryKey = ["spaces", "admin", search.trim(), pageToken] as const;
  const spacesQuery = useQuery({
    queryKey,
    queryFn: () => spaceServiceClient.listSpaces({ pageSize: PAGE_SIZE, pageToken, filter: search.trim(), showAll: true }),
  });
  const spaces = spacesQuery.data?.spaces ?? [];
  const nextPageToken = spacesQuery.data?.nextPageToken ?? "";

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSpace.mutateAsync({ name: deleteTarget.name });
      toast.success(t("setting.space-management.delete-success"));
      setDeleteTarget(undefined);
      await queryClient.invalidateQueries({ queryKey: ["spaces", "admin"] });
    } catch (error) {
      handleError(error, toast.error, { context: "Admin delete space" });
      throw error;
    }
  };

  return (
    <SettingSection title={t("setting.space-management.label")} description={t("setting.space-management.description")}>
      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          className="pl-9"
          placeholder={t("setting.space-management.search-placeholder")}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
            setPageTokens([""]);
          }}
        />
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
        {spacesQuery.isPending ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("setting.spaces.loading")}</p>
        ) : spaces.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("setting.space-management.empty")}</p>
        ) : (
          spaces.map((space) => {
            const uid = extractSpaceUidFromName(space.name);
            const accessLabel =
              space.accessMode === Space_AccessMode.PUBLIC
                ? t("space.access-mode-public")
                : space.accessMode === Space_AccessMode.AUTHENTICATED
                  ? t("space.access-mode-authenticated")
                  : t("space.access-mode-invite-only");
            return (
              <div key={space.name} className="flex min-w-0 items-center gap-3 px-3 py-3">
                <SpaceMark size="lg" avatarUrl={space.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{space.title}</p>
                    <Badge variant="outline" shape="pill" className="font-normal">
                      {accessLabel}
                    </Badge>
                    {!space.syncToMainFeed ? (
                      <Badge variant="secondary" shape="pill" className="font-normal">
                        {t("setting.space-management.not-synced")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{uid}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{space.description || t("setting.spaces.no-description")}</p>
                </div>
                <a
                  href={`/space/${space.urlSlug || uid}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("space.open-access-link")}
                  className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                >
                  <ExternalLinkIcon />
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("common.delete")}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(space)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("setting.space-management.page", { page })}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            {t("memo.pagination-previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!nextPageToken}
            onClick={() => {
              setPageTokens((tokens) => {
                const next = [...tokens];
                next[page] = nextPageToken;
                return next;
              });
              setPage((value) => value + 1);
            }}
          >
            {t("memo.pagination-next")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title={deleteTarget ? t("setting.space-management.delete-title", { title: deleteTarget.title }) : ""}
        description={t("setting.space-management.delete-description")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        confirmVariant="destructive"
        onConfirm={() => void handleDelete()}
      />
    </SettingSection>
  );
};

export default AdminSpacesSection;
