import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, ShuffleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import SpaceMark from "@/components/SpaceMark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSpaceContext } from "@/contexts/SpaceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { usePagedSpaces, useSampleSpaces } from "@/hooks/useSpaceQueries";
import { formatSpaceUidForDisplay } from "@/lib/space-display";
import { cn } from "@/lib/utils";
import { ListSpacesRequest_Scope, type Space, Space_AccessMode } from "@/types/proto/api/v1/space_service_pb";
import { useTranslate } from "@/utils/i18n";

/** Spaces suggested at random while nothing is searched. */
const RANDOM_COUNT = 4;
/** The search runs once typing pauses this long. */
const SEARCH_DELAY_MS = 300;

type DirectoryTab = "all" | "joined";

/** Directory orders, as the server's order_by values. */
const SORT_ORDERS = [
  { value: "create_time desc", labelKey: "space.directory.sort-newest" },
  { value: "member_count desc", labelKey: "space.directory.sort-members" },
  { value: "last_activity_time desc", labelKey: "space.directory.sort-active" },
  { value: "title", labelKey: "space.directory.sort-title" },
] as const;

const ACCESS_LABELS = {
  [Space_AccessMode.PUBLIC]: "space.access-mode-public",
  [Space_AccessMode.AUTHENTICATED]: "space.access-mode-authenticated",
  [Space_AccessMode.INVITE_ONLY]: "space.access-mode-invite-only",
} as const;

interface RowProps {
  space: Space;
  current: boolean;
  showUid: boolean;
  onOpen: (space: Space) => void;
}

const SpaceRow = ({ space, current, showUid, onOpen }: RowProps) => {
  const t = useTranslate();
  const access = space.accessMode in ACCESS_LABELS ? ACCESS_LABELS[space.accessMode as keyof typeof ACCESS_LABELS] : undefined;
  const members =
    space.memberCount > 0
      ? t(space.memberCount === 1 ? "setting.spaces.member-count" : "setting.spaces.members-count", { count: space.memberCount })
      : undefined;

  return (
    <button
      type="button"
      aria-current={current || undefined}
      onClick={() => onOpen(space)}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent",
        current && "bg-accent/60",
      )}
    >
      <SpaceMark avatarUrl={space.avatarUrl} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-medium">{space.title}</span>
          {showUid && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatSpaceUidForDisplay(space.name)}</span>}
        </span>
        {space.description && <span className="block truncate text-xs text-muted-foreground">{space.description}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end text-[11px] leading-4 text-muted-foreground">
        {members && <span className="tabular-nums">{members}</span>}
        {access && <span>{t(access)}</span>}
      </span>
    </button>
  );
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Every Space the visitor can open, for sites with too many to list in the switcher: a search over title,
 * description and ID, the full directory a page at a time, the visitor's own Spaces, and a few at random.
 */
const SpaceDirectoryDialog = ({ open, onOpenChange }: Props) => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { totalSpaces, duplicateSpaceTitles, selectedSpaceName, selectSpace } = useSpaceContext();
  const [tab, setTab] = useState<DirectoryTab>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageTokens, setPageTokens] = useState<string[]>([""]);
  const [order, setOrder] = useState<string>(SORT_ORDERS[0].value);
  const sortOptions = SORT_ORDERS.map((option) => ({ value: option.value, label: t(option.labelKey) }));
  const sample = useSampleSpaces(currentUser?.name, RANDOM_COUNT, open);
  const suggested = sample.data?.spaces ?? [];

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  // A new search or tab starts over from the first page.
  useEffect(() => {
    setPage(1);
    setPageTokens([""]);
  }, [query, tab, order]);

  const directory = usePagedSpaces(currentUser?.name, query, pageTokens[page - 1] ?? "", {
    enabled: open,
    scope: tab === "joined" ? ListSpacesRequest_Scope.JOINED : ListSpacesRequest_Scope.VISIBLE,
    orderBy: order,
  });
  const rows = directory.data?.spaces ?? [];
  const nextPageToken = directory.data?.nextPageToken ?? "";
  const hasNext = !!nextPageToken;
  const loading = directory.isLoading;
  const showSuggestions = tab === "all" && !query && page === 1 && totalSpaces > RANDOM_COUNT;
  const goNext = () => {
    setPageTokens((tokens) => {
      const next = [...tokens];
      next[page] = nextPageToken;
      return next;
    });
    setPage(page + 1);
  };

  const openSpace = (space: Space) => {
    selectSpace(space);
    onOpenChange(false);
  };

  const renderRow = (space: Space) => (
    <SpaceRow
      key={space.name}
      space={space}
      current={space.name === selectedSpaceName}
      showUid={duplicateSpaceTitles.has(space.title)}
      onOpen={openSpace}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" data-space-directory="">
        <DialogHeader>
          <DialogTitle>{t("space.directory.title")}</DialogTitle>
          <DialogDescription>{t("space.directory.description")}</DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 rounded-md border border-border px-3 focus-within:ring-2 focus-within:ring-ring/50">
          <SearchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("space.directory.search")}
            aria-label={t("space.directory.search")}
            className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </label>

        {currentUser && (
          <div role="tablist" className="flex gap-1 rounded-md bg-muted/60 p-1 text-sm">
            {(["all", "joined"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "flex-1 rounded px-3 py-1 transition-colors",
                  tab === value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`space.directory.tab-${value}`)}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("space.directory.total", { count: directory.data?.totalSize ?? 0 })}</span>
          <Select value={order} items={sortOptions} onValueChange={(value) => value && setOrder(value)}>
            <SelectTrigger aria-label={t("space.directory.sort")} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex max-h-[min(60vh,32rem)] flex-col gap-3 overflow-y-auto">
          {showSuggestions && suggested.length > 0 && (
            <section aria-label={t("space.directory.random")}>
              <div className="mb-1 flex items-center justify-between px-2">
                <h3 className="text-xs text-muted-foreground">{t("space.directory.random")}</h3>
                <Button variant="ghost" size="sm" onClick={() => void sample.refetch()}>
                  <ShuffleIcon className="size-3.5" />
                  {t("space.directory.shuffle")}
                </Button>
              </div>
              <div className="grid gap-0.5 sm:grid-cols-2">{suggested.map(renderRow)}</div>
            </section>
          )}

          <section aria-label={t(`space.directory.tab-${tab}`)}>
            {showSuggestions && <h3 className="mb-1 px-2 text-xs text-muted-foreground">{t("space.directory.tab-all")}</h3>}
            {loading ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("space.loading")}</p>
            ) : rows.length > 0 ? (
              <div className="flex flex-col gap-0.5">{rows.map(renderRow)}</div>
            ) : (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {query ? t("space.directory.no-results") : tab === "joined" ? t("space.directory.no-joined") : t("space.directory.empty")}
              </p>
            )}
          </section>
        </div>

        {(page > 1 || hasNext) && (
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeftIcon className="size-4" />
              {t("memo.pagination-previous")}
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">{t("space.directory.page", { page })}</span>
            <Button variant="ghost" size="sm" disabled={!hasNext} onClick={goNext}>
              {t("memo.pagination-next")}
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SpaceDirectoryDialog;
