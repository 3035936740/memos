import { useEffect, useMemo, useState } from "react";
import { useInstance } from "@/contexts/InstanceContext";
import { type MemoFilter, stringifyFilters } from "@/contexts/MemoFilterContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useMemos } from "@/hooks/useMemoQueries";
import { useUserStats } from "@/hooks/useUserQueries";
import { canAccessInstanceContent, parseInstanceCategories, parseInstancePages } from "@/lib/instance-content";
import { ROUTES } from "@/router/routes";
import { State } from "@/types/proto/api/v1/common_pb";
import { useTranslate } from "@/utils/i18n";

export type QuickJumpKind = "page" | "category" | "tag" | "memo";

export const QUICK_JUMP_KINDS: QuickJumpKind[] = ["page", "category", "tag", "memo"];

/** A place Quick Find can open directly instead of searching. */
export interface QuickJump {
  id: string;
  kind: QuickJumpKind;
  label: string;
  to: string;
  /** Memo filters to apply on arrival (a tag), the way a search applies its words. */
  filters?: MemoFilter[];
}

/** At most this many jumps of one kind are listed. */
const PER_KIND = 5;
/** Matching articles are looked up once typing pauses this long. */
const MEMO_LOOKUP_DELAY_MS = 250;
/** Shorter queries list pages, categories and tags only; one letter matches too many articles to be useful. */
const MEMO_LOOKUP_MIN_LENGTH = 2;

export const matchesQuery = (query: string, ...texts: string[]) => {
  const needle = query.trim().toLowerCase();
  return needle !== "" && texts.some((text) => text.toLowerCase().includes(needle));
};

/** A content filter for the memo lookup; JSON string quoting is also a valid CEL string literal. */
export const memoLookupFilter = (query: string) => `content.contains(${JSON.stringify(query.trim())})`;

/**
 * The places that match `query`: app pages, custom pages and categories the visitor may open, their tags, and
 * articles whose text contains it. Empty while there is no query.
 */
export const useQuickFindJumps = (query: string): QuickJump[] => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { generalSetting } = useInstance();
  const term = query.trim();
  const [lookup, setLookup] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setLookup(term), MEMO_LOOKUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [term]);

  const { data: stats } = useUserStats(currentUser?.name, { enabled: !!currentUser && term !== "" });
  const { data: memoResults } = useMemos(
    { state: State.NORMAL, pageSize: PER_KIND, orderBy: "create_time desc", filter: memoLookupFilter(lookup) },
    { enabled: lookup.length >= MEMO_LOOKUP_MIN_LENGTH },
  );

  return useMemo(() => {
    if (!term) return [];
    const signedIn = !!currentUser;
    const pages: Array<{ label: string; to: string; signedIn?: boolean }> = [
      { label: t("common.home"), to: ROUTES.HOME, signedIn: true },
      { label: t("common.explore"), to: ROUTES.EXPLORE },
      { label: t("common.archived"), to: ROUTES.ARCHIVED, signedIn: true },
      { label: t("memo.read-later.title"), to: ROUTES.READ_LATER, signedIn: true },
      { label: t("common.views"), to: ROUTES.VIEWS, signedIn: true },
      { label: t("common.attachments"), to: ROUTES.ATTACHMENTS, signedIn: true },
      { label: t("common.inbox"), to: ROUTES.INBOX, signedIn: true },
      { label: t("common.settings"), to: ROUTES.SETTING, signedIn: true },
      { label: t("common.about"), to: ROUTES.ABOUT },
    ];
    const customPages = parseInstancePages(generalSetting.customPagesJson ?? "")
      .filter((page) => canAccessInstanceContent(page.access, currentUser))
      .map((page) => ({ label: page.title || page.slug, to: `/pages/${encodeURIComponent(page.slug)}`, slug: page.slug }));
    const categories = parseInstanceCategories(generalSetting.memoCategoriesJson ?? "").filter((category) =>
      canAccessInstanceContent(category.access, currentUser),
    );
    const tags = Object.entries(stats?.tagCount ?? {}).sort((a, b) => b[1] - a[1]);
    // Signed-in visitors search their own Home; everyone else the public feed.
    const feed = signedIn ? ROUTES.HOME : ROUTES.EXPLORE;

    const jumps: QuickJump[] = [
      ...pages
        .filter((page) => (!page.signedIn || signedIn) && matchesQuery(term, page.label, page.to))
        .map((page) => ({ id: `page:${page.to}`, kind: "page" as const, label: page.label, to: page.to })),
      ...customPages
        .filter((page) => matchesQuery(term, page.label, page.slug))
        .map((page) => ({ id: `page:${page.to}`, kind: "page" as const, label: page.label, to: page.to })),
    ].slice(0, PER_KIND);

    jumps.push(
      ...categories
        .filter((category) => matchesQuery(term, category.title, category.slug))
        .slice(0, PER_KIND)
        .map((category) => ({
          id: `category:${category.slug}`,
          kind: "category" as const,
          label: category.title || category.slug,
          to: `/categories/${encodeURIComponent(category.slug)}`,
        })),
    );

    jumps.push(
      ...tags
        .filter(([tag]) => matchesQuery(term, tag))
        .slice(0, PER_KIND)
        .map(([tag]) => {
          const filters: MemoFilter[] = [{ factor: "tagSearch", value: tag }];
          return { id: `tag:${tag}`, kind: "tag" as const, label: `#${tag}`, to: `${feed}?filter=${stringifyFilters(filters)}`, filters };
        }),
    );

    // Results for an older query are left out until the lookup for this one has run.
    if (lookup === term) {
      jumps.push(
        ...(memoResults?.memos ?? [])
          .filter((memo) => !memo.parent)
          .map((memo) => ({
            id: `memo:${memo.name}`,
            kind: "memo" as const,
            label: memo.property?.title || memo.snippet || memo.content.slice(0, 80),
            to: `/${memo.name}`,
          })),
      );
    }
    return jumps;
  }, [currentUser, generalSetting.customPagesJson, generalSetting.memoCategoriesJson, lookup, memoResults, stats, t, term]);
};
