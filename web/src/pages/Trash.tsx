import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { memoServiceClient } from "@/connect";
import useCurrentUser from "@/hooks/useCurrentUser";
import { memoKeys } from "@/hooks/useMemoQueries";
import { useTranslate } from "@/utils/i18n";
import { isSuperUser } from "@/utils/user";

const Trash = () => {
  const t = useTranslate();
  const user = useCurrentUser();
  const client = useQueryClient();
  const [all, setAll] = useState(false);
  const [tokens, setTokens] = useState([""]);
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<string>();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["trash", user?.name, all, tokens[page]],
    queryFn: () => memoServiceClient.listDeletedMemos({ pageSize: 20, pageToken: tokens[page], showAll: all }),
    enabled: !!user,
  });
  const mutate = async (name: string, purge = false) => {
    setBusy(true);
    try {
      if (name === "*") await memoServiceClient.emptyTrash({ showAll: all });
      else if (purge) await memoServiceClient.purgeMemo({ name });
      else await memoServiceClient.restoreMemo({ name });
      await client.invalidateQueries({ queryKey: ["trash"] });
      await client.invalidateQueries({ queryKey: memoKeys.all });
      await client.invalidateQueries({ queryKey: ["attachments"] });
      await client.invalidateQueries({ queryKey: ["users"] });
      setPending(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-page-panel="" className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t("trash.title")}</h1>
        <Button variant="destructive" disabled={busy || !query.data?.memos.length} onClick={() => setPending("*")}>
          {t("trash.empty")}
        </Button>
      </div>
      {isSuperUser(user) && (
        <label className="flex gap-2 text-sm">
          <Switch
            checked={all}
            onCheckedChange={(checked) => {
              setAll(checked);
              setPage(0);
              setTokens([""]);
            }}
          />
          {t("trash.all")}
        </label>
      )}
      {query.isPending ? (
        <p>{t("common.loading")}</p>
      ) : query.isError ? (
        <p role="alert" className="text-destructive">
          {query.error.message}
        </p>
      ) : !query.data.memos.length ? (
        <p className="py-8 text-center text-muted-foreground">{t("trash.none")}</p>
      ) : (
        query.data.memos.map((memo) => (
          <article key={memo.name} data-settings-surface="" className="space-y-2 rounded-lg border p-4">
            <h2 className="font-medium">{memo.property?.title || Array.from(memo.content).slice(0, 50).join("")}</h2>
            <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {Array.from(memo.content).slice(0, 100).join("")}
            </p>
            <p className="text-xs text-muted-foreground">
              {memo.purgeTime &&
                t("trash.remaining", { count: Math.max(0, Math.ceil((timestampDate(memo.purgeTime).getTime() - Date.now()) / 86400000)) })}
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => void mutate(memo.name)}>
                {t("common.restore")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending(memo.name)}>
                {t("trash.purge")}
              </Button>
            </div>
          </article>
        ))
      )}
      <div className="flex justify-between">
        <Button variant="ghost" disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>
          {t("memo.pagination-previous")}
        </Button>
        <Button
          variant="ghost"
          disabled={!query.data?.nextPageToken || busy}
          onClick={() => {
            const next = [...tokens];
            next[page + 1] = query.data!.nextPageToken;
            setTokens(next);
            setPage(page + 1);
          }}
        >
          {t("memo.pagination-next")}
        </Button>
      </div>
      <ConfirmDialog
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        open={!!pending}
        onOpenChange={(open) => !open && !busy && setPending(undefined)}
        title={t(pending === "*" ? "trash.empty" : "trash.purge")}
        description={t("trash.irreversible")}
        confirmVariant="destructive"
        onConfirm={async () => {
          if (pending) await mutate(pending, true);
        }}
      />
    </section>
  );
};
export default Trash;
