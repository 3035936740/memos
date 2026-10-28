import { CornerDownLeftIcon, FileTextIcon, FolderIcon, HashIcon, PanelsTopLeftIcon, SearchIcon } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAppSidebar } from "@/contexts/AppSidebarContext";
import { type MemoFilter, replaceFiltersByFactor, stringifyFilters, useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { useSpaceContext } from "@/contexts/SpaceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useMemoViews } from "@/hooks/useUserQueries";
import { BUILTIN_TASKS_VIEW_ID, getMemoViewId, isMemoScopeRoute } from "@/lib/memo-views";
import { extractSpaceUidFromName, formatSpaceUidForDisplay } from "@/lib/space-display";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { getRouteActionPolicy, getSidebarRouteKind } from "./routes";
import { QUICK_JUMP_KINDS, type QuickJump, type QuickJumpKind, useQuickFindJumps } from "./useQuickFindJumps";

const JUMP_ICONS: Record<QuickJumpKind, typeof SearchIcon> = {
  page: PanelsTopLeftIcon,
  category: FolderIcon,
  tag: HashIcon,
  memo: FileTextIcon,
};

/** Ctrl+K, or ⌘K on a Mac, opens and closes Quick Find from anywhere. Autofill fires keydowns without a key. */
const isQuickFindShortcut = (event: KeyboardEvent) =>
  event.key?.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;

export const buildQuickFindFilters = (query: string, currentFilters: MemoFilter[], preserveCurrentScope: boolean): MemoFilter[] => {
  const words = Array.from(new Set(query.trim().split(/\s+/).filter(Boolean)));
  const contentFilters: MemoFilter[] = words.map((value) => ({ factor: "contentSearch", value }));
  return preserveCurrentScope ? replaceFiltersByFactor(currentFilters, "contentSearch", contentFilters) : contentFilters;
};

export interface QuickFindSubmission {
  filters: MemoFilter[];
  destination?: string;
  switchToAll: boolean;
}

export const resolveQuickFindSubmission = (pathname: string, query: string, currentFilters: MemoFilter[]): QuickFindSubmission => {
  const routePolicy = getRouteActionPolicy(pathname);
  const filters = buildQuickFindFilters(query, currentFilters, routePolicy.searchScope !== "all");
  const filterQuery = stringifyFilters(filters);
  return {
    filters,
    destination: routePolicy.searchDestination
      ? filterQuery
        ? `${routePolicy.searchDestination}?filter=${filterQuery}`
        : routePolicy.searchDestination
      : undefined,
    switchToAll: routePolicy.searchScope === "all",
  };
};

const getScopeLabel = (pathname: string, t: ReturnType<typeof useTranslate>) => {
  const routeKind = getSidebarRouteKind(pathname);
  if (routeKind === "archived") return t("common.archived");
  if (routeKind === "explore") return t("common.explore");
  if (routeKind === "profile") return t("common.profile");
  return t("common.memos");
};

const QuickFindDialog = () => {
  const t = useTranslate();
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const { data: memoViews = [] } = useMemoViews(currentUser?.name);
  const { filters, setFilters, setMemoView, memoView } = useMemoFilterContext();
  const { clearSelectedSpace, duplicateSpaceTitles, selectedSpace, selectedSpaceName } = useSpaceContext();
  const { quickFindOpen, setQuickFindOpen, setMobileOpen } = useAppSidebar();
  const [query, setQuery] = useState("");
  // -1 is the search itself (Enter searches); 0 and up pick one of the jumps listed under the field.
  const [activeJump, setActiveJump] = useState(-1);
  const jumps = useQuickFindJumps(quickFindOpen ? query : "");
  const viewApplies = isMemoScopeRoute(location.pathname);
  const selectedMemoView = viewApplies ? memoViews.find((item) => getMemoViewId(item.name) === memoView) : undefined;
  const lensLabel =
    viewApplies && memoView === BUILTIN_TASKS_VIEW_ID ? t("common.tasks") : selectedMemoView?.title || getScopeLabel(location.pathname, t);
  const routePolicy = getRouteActionPolicy(location.pathname);
  const selectedSpaceUid = selectedSpaceName ? extractSpaceUidFromName(selectedSpaceName) : "";
  const selectedSpaceUidDisplay = selectedSpaceName ? formatSpaceUidForDisplay(selectedSpaceName) : "";
  const showSelectedSpaceUid = selectedSpace ? duplicateSpaceTitles.has(selectedSpace.title) : Boolean(selectedSpaceName);
  const selectedSpaceLabel = `${selectedSpace?.title || t("space.current")}${
    showSelectedSpaceUid && selectedSpaceUid ? ` (${selectedSpaceUid})` : ""
  }`;
  const compactSelectedSpaceLabel = `${selectedSpace?.title || t("space.current")}${
    showSelectedSpaceUid && selectedSpaceUidDisplay ? ` (${selectedSpaceUidDisplay})` : ""
  }`;
  const scopeLabel =
    routePolicy.searchScope === "remembered-collection" && selectedSpaceName ? `${selectedSpaceLabel} · ${lensLabel}` : lensLabel;
  const compactScopeLabel =
    routePolicy.searchScope === "remembered-collection" && selectedSpaceName ? `${compactSelectedSpaceLabel} · ${lensLabel}` : lensLabel;

  useEffect(() => {
    if (!quickFindOpen) return;
    setQuery(
      filters
        .filter((filter) => filter.factor === "contentSearch")
        .map((filter) => filter.value)
        .join(" "),
    );
  }, [filters, quickFindOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isQuickFindShortcut(event)) return;
      event.preventDefault();
      setMobileOpen(false);
      setQuickFindOpen(!quickFindOpen);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [quickFindOpen, setMobileOpen, setQuickFindOpen]);

  useEffect(() => {
    setActiveJump(-1);
  }, [query]);

  const openJump = (jump: QuickJump) => {
    if (jump.filters) {
      setFilters(jump.filters);
      setMemoView(undefined);
    }
    navigate(jump.to);
    setQuickFindOpen(false);
  };

  const submitQuery = () => {
    const submission = resolveQuickFindSubmission(location.pathname, query, filters);

    if (submission.switchToAll) {
      // This is an explicit cross-Space action, so switch the collection state
      // to All without inserting an intermediate Home history entry.
      clearSelectedSpace();
    }

    setFilters(submission.filters);

    if (submission.destination) {
      setMemoView(undefined);
      navigate(submission.destination);
    }

    setQuickFindOpen(false);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitQuery();
  };

  return (
    <Dialog open={quickFindOpen} onOpenChange={setQuickFindOpen}>
      <DialogContent
        size="lg"
        className="top-[12vh]! translate-y-0! overflow-hidden border-border/70 p-0! shadow-xl sm:top-[16vh]! [&>div:first-child]:gap-0!"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{t("common.search")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("common.search")} {scopeLabel}
        </DialogDescription>
        <form onSubmit={handleSubmit} className="flex h-[52px] shrink-0 items-center gap-2.5 px-4">
          <SearchIcon className="size-[17px] shrink-0 text-muted-foreground" strokeWidth={1.8} />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setActiveJump((index) => Math.max(-1, Math.min(jumps.length - 1, index + step)));
                return;
              }
              if (event.key !== "Enter") return;
              event.preventDefault();
              const jump = jumps[activeJump];
              if (jump) openJump(jump);
              else submitQuery();
            }}
            aria-controls={jumps.length > 0 ? "quick-find-jumps" : undefined}
            aria-activedescendant={jumps[activeJump] ? `quick-find-jump-${activeJump}` : undefined}
            className="h-10 border-0 bg-transparent px-0 !text-[14px] shadow-none focus-visible:ring-0"
            placeholder={`${t("common.search")} ${compactScopeLabel}`}
            aria-label={`${t("common.search")} ${scopeLabel}`}
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 rounded-md text-muted-foreground"
            aria-label={t("common.search")}
          >
            <CornerDownLeftIcon className="size-3.5" />
          </Button>
        </form>
        {jumps.length > 0 && (
          <div
            id="quick-find-jumps"
            role="listbox"
            aria-label={t("quick-find.jumps")}
            className="max-h-[min(50vh,24rem)] overflow-y-auto border-t border-border/70 py-1.5"
          >
            {QUICK_JUMP_KINDS.map((kind) => {
              const items = jumps.flatMap((jump, index) => (jump.kind === kind ? [{ jump, index }] : []));
              if (items.length === 0) return null;
              const Icon = JUMP_ICONS[kind];
              return (
                <div key={kind} role="group" aria-label={t(`quick-find.kind.${kind}`)}>
                  <p className="px-4 pb-0.5 pt-1.5 text-[11px] text-muted-foreground">{t(`quick-find.kind.${kind}`)}</p>
                  {items.map(({ jump, index }) => (
                    <button
                      key={jump.id}
                      id={`quick-find-jump-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeJump}
                      onMouseEnter={() => setActiveJump(index)}
                      onClick={() => openJump(jump)}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2.5 px-4 py-1.5 text-left text-sm text-foreground/90",
                        index === activeJump && "bg-accent text-accent-foreground",
                      )}
                    >
                      <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{jump.label}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            <p className="px-4 pb-1 pt-2 text-[11px] text-muted-foreground">{t("quick-find.hint")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuickFindDialog;
