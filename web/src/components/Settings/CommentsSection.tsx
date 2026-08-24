import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import SettingSection from "@/components/Settings/SettingSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AdminCommentItem, listAdminComments } from "@/utils/admin-comments";
import { useTranslate } from "@/utils/i18n";

const PAGE_SIZE = 20;

const CommentsSection = () => {
  const t = useTranslate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AdminCommentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listAdminComments(page, PAGE_SIZE, query)
      .then((result) => {
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : t("setting.comments.load-failed"));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, query, t]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <SettingSection title={t("setting.comments.label")} description={t("setting.comments.description")}>
      <form
        className="relative max-w-md"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("setting.comments.search-placeholder")}
        />
      </form>
      <div className="overflow-hidden rounded-lg border border-border">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("setting.comments.empty")}</div>
        ) : (
          items.map((item) => (
            <div key={item.name} className="flex flex-col gap-2 border-b border-border p-4 last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{t("setting.comments.author", { author: `@${item.creator}` })}</span>
                {item.parent ? (
                  <Link to={`/${item.parent}`} className="hover:underline">
                    {t("setting.comments.view-memo")}
                  </Link>
                ) : null}
                <span>{new Date(item.createdTs * 1000).toLocaleString()}</span>
              </div>
              <Link to={`/${item.name}`} className="whitespace-pre-wrap break-words text-sm text-foreground hover:underline">
                {item.content}
              </Link>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("setting.comments.total", { count: total })}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            {t("memo.pagination-previous")}
          </Button>
          <span>
            {page} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
            {t("memo.pagination-next")}
          </Button>
        </div>
      </div>
    </SettingSection>
  );
};

export default CommentsSection;
