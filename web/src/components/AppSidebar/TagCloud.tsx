import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { replaceFiltersByFactor, stringifyFilters, useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

/** How many of the most used tags show before the cloud folds. */
const FOLDED_COUNT = 20;

interface Props {
  tagCount: Record<string, number>;
  /** When set, a tag opens this route filtered by it instead of filtering the current feed. */
  navigationTarget?: string;
}

/**
 * Tags as a cloud of chips, at most four to a row: every chip is at least a quarter of the row wide (less the gaps),
 * so a fifth never fits, and a tag too long for its quarter takes the room it needs and moves to the next row.
 */
const TagCloud = ({ tagCount, navigationTarget }: Props) => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { filters, setFilters, getFiltersByFactor, addFilter, removeFilter } = useMemoFilterContext();
  const [expanded, setExpanded] = useState(false);
  const activeTags = new Set(getFiltersByFactor("tagSearch").map((filter) => filter.value));
  const tags = useMemo(() => Object.entries(tagCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), [tagCount]);
  const visibleTags = expanded ? tags : tags.slice(0, FOLDED_COUNT);

  const handleTagClick = (tag: string) => {
    if (navigationTarget) {
      const nextFilters = replaceFiltersByFactor(filters, "tagSearch", [{ factor: "tagSearch", value: tag }]);
      setFilters(nextFilters);
      navigate({ pathname: navigationTarget, search: `?filter=${stringifyFilters(nextFilters)}` });
      return;
    }
    if (activeTags.has(tag)) {
      removeFilter((filter) => filter.factor === "tagSearch" && filter.value === tag);
    } else {
      removeFilter((filter) => filter.factor === "tagSearch");
      addFilter({ factor: "tagSearch", value: tag });
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {visibleTags.map(([tag, amount]) => {
          const active = activeTags.has(tag);
          return (
            <button
              key={tag}
              type="button"
              data-sb-cloud-tag=""
              aria-pressed={active}
              title={`#${tag} (${amount})`}
              onClick={() => handleTagClick(tag)}
              className={cn(
                "inline-flex h-7 min-w-[calc((100%_-_1.125rem)/4)] max-w-full items-center justify-center gap-1 rounded-full px-2.5 text-xs transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-muted/70 text-foreground/80 hover:bg-primary/12 hover:text-primary",
              )}
            >
              <span className="min-w-0 truncate">#{tag}</span>
              <span className="shrink-0 text-[10px] tabular-nums opacity-60">{amount}</span>
            </button>
          );
        })}
      </div>
      {tags.length > FOLDED_COUNT && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="mt-2.5 h-auto px-1 py-1 text-xs text-muted-foreground hover:text-primary"
        >
          {expanded ? t("common.collapse") : `${t("common.expand")} (${tags.length})`}
        </Button>
      )}
    </>
  );
};

export default TagCloud;
