import { ChevronRightIcon, FolderIcon, HashIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppSidebar } from "@/contexts/AppSidebarContext";
import { type MemoFilter, replaceFiltersByFactor, stringifyFilters, useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { useSpaceContext } from "@/contexts/SpaceContext";
import { useLocalStorage } from "@/hooks";
import { useAllUserStats } from "@/hooks/useUserQueries";
import { combineCELFilters } from "@/lib/cel-filter";
import type { InstanceMemoCategory } from "@/lib/instance-content";
import { mergeTagCounts } from "@/lib/tag";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import { useTranslate } from "@/utils/i18n";
import {
  SIDEBAR_ROW_BOX_CLASSES,
  SIDEBAR_ROW_CLASSES,
  SIDEBAR_ROW_COUNT_CLASSES,
  SIDEBAR_ROW_FOCUS_CLASSES,
  SIDEBAR_ROW_ICON_CLASSES,
  sidebarRowStateClasses,
} from "./SidebarRow";

/** Blog 2's menu rows: the sidebar row, a notch roomier. */
export const BLOG_NAV_ROW_CLASSES = "h-9 gap-2.5 px-2.5 text-[13.5px]";

const CHEVRON_CLASSES = "size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none";

/** A titled group of the Blog 2 menu that folds away; the choice is remembered per group. */
export const BlogNavGroup = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => {
  const [open, setOpen] = useLocalStorage<boolean>(`blog-nav-${id}-open`, true);
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-7 w-full items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground/75 transition-colors hover:text-foreground",
          SIDEBAR_ROW_FOCUS_CLASSES,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronRightIcon className={cn(CHEVRON_CLASSES, open && "rotate-90")} strokeWidth={1.8} />
      </button>
      {open && <div className="mt-0.5 flex flex-col gap-0.5">{children}</div>}
    </div>
  );
};

/** Blog 2's categories: a category opens everything in it; unfolding it lists its tags to narrow that down. */
export const BlogCategoryNav = ({ categories, activeSlug }: { categories: InstanceMemoCategory[]; activeSlug?: string }) => (
  <>
    {categories.map((category) => (
      <BlogCategoryItem key={category.slug} category={category} active={category.slug === activeSlug} />
    ))}
  </>
);

const BlogCategoryItem = ({ category, active }: { category: InstanceMemoCategory; active: boolean }) => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { filters, setFilters, getFiltersByFactor } = useMemoFilterContext();
  const { setMobileOpen } = useAppSidebar();
  const [open, setOpen] = useState(active);
  const path = `/categories/${category.slug}`;
  const activeTag = active ? getFiltersByFactor("tagSearch")[0]?.value : undefined;

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  // Other filters only carry over within the category itself; arriving from elsewhere starts clean.
  const go = (tagFilters: MemoFilter[]) => {
    const nextFilters = replaceFiltersByFactor(active ? filters : [], "tagSearch", tagFilters);
    const query = stringifyFilters(nextFilters);
    setFilters(nextFilters);
    navigate({ pathname: path, search: query ? `?filter=${query}` : "" });
    setMobileOpen(false);
  };

  return (
    <div>
      <div className={cn(SIDEBAR_ROW_BOX_CLASSES, sidebarRowStateClasses(active && !activeTag), BLOG_NAV_ROW_CLASSES, "pe-1")}>
        <button
          type="button"
          aria-current={active && !activeTag ? "page" : undefined}
          onClick={() => {
            go([]);
            setOpen(true);
          }}
          className={cn("flex min-w-0 flex-1 items-center gap-2.5 self-stretch rounded-md text-left", SIDEBAR_ROW_FOCUS_CLASSES)}
        >
          <FolderIcon className="size-4 shrink-0 opacity-80" strokeWidth={1.8} />
          <span className="min-w-0 flex-1 truncate">{category.title}</span>
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${category.title}: ${open ? t("common.collapse") : t("common.expand")}`}
          onClick={() => setOpen(!open)}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-sidebar-accent hover:text-foreground",
            SIDEBAR_ROW_FOCUS_CLASSES,
          )}
        >
          <ChevronRightIcon className={cn(CHEVRON_CLASSES, open && "rotate-90")} strokeWidth={1.8} />
        </button>
      </div>
      {open && (
        <CategoryTags
          slug={category.slug}
          activeTag={activeTag}
          onSelect={(tag) => go(tag === activeTag ? [] : [{ factor: "tagSearch", value: tag }])}
        />
      )}
    </div>
  );
};

/** The tags used inside one category, fetched only once the category is unfolded. */
const CategoryTags = ({ slug, activeTag, onSelect }: { slug: string; activeTag?: string; onSelect: (tag: string) => void }) => {
  const t = useTranslate();
  const { memoFilter } = useSpaceContext();
  const { data: stats = [], isLoading } = useAllUserStats({
    state: State.NORMAL,
    filter: combineCELFilters(`category == ${JSON.stringify(slug)}`, memoFilter),
  });
  const tags = useMemo(() => {
    const counts = mergeTagCounts(...stats.map((item) => item.tagCount));
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [stats]);

  if (isLoading) return null;

  return (
    <div className="ms-[1.1rem] flex flex-col gap-0.5 border-s border-border/70 py-0.5 ps-2">
      {tags.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground/70">{t("message.no-data")}</p>
      ) : (
        tags.map(([tag, amount]) => (
          <button
            key={tag}
            type="button"
            aria-pressed={tag === activeTag}
            onClick={() => onSelect(tag)}
            className={cn(SIDEBAR_ROW_CLASSES, sidebarRowStateClasses(tag === activeTag))}
          >
            <HashIcon className={SIDEBAR_ROW_ICON_CLASSES} strokeWidth={1.8} />
            <span className="min-w-0 flex-1 truncate text-left">{tag}</span>
            <span className={SIDEBAR_ROW_COUNT_CLASSES}>{amount}</span>
          </button>
        ))
      )}
    </div>
  );
};
