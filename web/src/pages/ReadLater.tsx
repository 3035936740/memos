import { BookmarkIcon, BookmarkMinusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTranslate } from "@/utils/i18n";
import { deleteBookmark, listBookmarks, type ModerationItem } from "@/utils/moderation";

const PAGE_SIZE = 20;

const ReadLater = () => {
  const t = useTranslate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [total, setTotal] = useState(0);

  const loadBookmarks = useCallback(() => {
    return listBookmarks(page, PAGE_SIZE)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      });
  }, [page]);

  useEffect(() => {
    void loadBookmarks();
  }, [loadBookmarks]);

  const removeItem = async (item: ModerationItem) => {
    try {
      await deleteBookmark(item.targetName.replace(/^memos\//, ""));
      toast.success(t("memo.read-later.removed"));
      if (items.length === 1 && page > 1) {
        setParams({ page: String(page - 1) });
      } else {
        await loadBookmarks();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("memo.read-later.remove-failed"));
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex items-center gap-2">
        <BookmarkIcon className="size-5" />
        <h1 className="text-xl font-semibold">{t("memo.read-later.title")}</h1>
      </header>
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">{t("message.no-data")}</div>
        ) : (
          items.map((item) => (
            <div key={item.targetId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <Link
                to={`/${item.targetName}`}
                state={{ from: `${location.pathname}${location.search}` }}
                className="min-w-0 flex-1 rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <h2 className="line-clamp-2 font-semibold">{item.title}</h2>
                {item.creator ? <p className="mt-2 text-xs text-muted-foreground">@{item.creator}</p> : null}
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={t("memo.read-later.remove")}
                title={t("memo.read-later.remove")}
                onClick={() => void removeItem(item)}
              >
                <BookmarkMinusIcon className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>
      {pages > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
            {t("memo.pagination-previous")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {pages}
          </span>
          <Button variant="outline" disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) })}>
            {t("memo.pagination-next")}
          </Button>
        </div>
      ) : null}
    </section>
  );
};

export default ReadLater;
