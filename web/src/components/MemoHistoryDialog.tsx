import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { memoServiceClient } from "@/connect";
import { memoKeys } from "@/hooks/useMemoQueries";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

/** A bounded line comparison without quadratic LCS allocations on long memos. */
const compareLines = (current: string, historical: string) => {
  const before = current.split("\n");
  const after = historical.split("\n");
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++;
  return [
    ...before.slice(Math.max(0, prefix - 3), prefix).map((text) => ({ type: " ", text })),
    ...before.slice(prefix, before.length - suffix).map((text) => ({ type: "−", text })),
    ...after.slice(prefix, after.length - suffix).map((text) => ({ type: "+", text })),
    ...after.slice(after.length - suffix, after.length - suffix + 3).map((text) => ({ type: " ", text })),
  ].slice(0, 1000);
};

const MemoHistoryDialog = ({ memo, open, onOpenChange }: { memo: Memo; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const t = useTranslate();
  const client = useQueryClient();
  const [selected, setSelected] = useState<bigint>();
  const [pending, setPending] = useState<{ type: "restore" | "delete" | "clear"; id?: bigint }>();
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ["memo-revisions", memo.name],
    queryFn: () => memoServiceClient.listMemoRevisions({ name: memo.name }),
    enabled: open,
  });
  const id = selected ?? list.data?.revisions[0]?.id;
  const version = useQuery({
    queryKey: ["memo-revision", memo.name, String(id)],
    queryFn: () => memoServiceClient.getMemoRevision({ name: memo.name, revisionId: id! }),
    enabled: open && id !== undefined,
  });
  const diff = useMemo(() => compareLines(memo.content, version.data?.content ?? ""), [memo.content, version.data?.content]);
  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const request = { name: memo.name, revisionId: pending.id };
      if (pending.type === "restore") await memoServiceClient.restoreMemoRevision(request);
      else if (pending.type === "delete") await memoServiceClient.deleteMemoRevision(request);
      else await memoServiceClient.clearMemoRevisions({ name: memo.name });
      await client.invalidateQueries({ queryKey: memoKeys.all });
      await client.invalidateQueries({ queryKey: ["memo-revisions", memo.name] });
      client.removeQueries({ queryKey: ["memo-revision", memo.name] });
      setSelected(undefined);
      setPending(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{t("history.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("history.private")}</p>
          {list.isError && (
            <p role="alert" className="text-destructive">
              {list.error.message}
            </p>
          )}
          <div className="grid max-h-[65vh] min-h-0 gap-3 overflow-y-auto sm:grid-cols-[11rem_1fr]">
            <div className="space-y-2">
              {list.isPending
                ? t("common.loading")
                : !list.data?.revisions.length
                  ? t("history.empty")
                  : list.data.revisions.map((revision) => (
                      <button
                        key={String(revision.id)}
                        type="button"
                        aria-pressed={revision.id === id}
                        onClick={() => setSelected(revision.id)}
                        className="block w-full rounded border px-2 py-2 text-left text-xs aria-pressed:bg-accent"
                      >
                        <span className="block">{revision.createTime && timestampDate(revision.createTime).toLocaleString()}</span>
                        <span className="block text-muted-foreground">{revision.editor}</span>
                        <span className="line-clamp-2">{revision.preview}</span>
                      </button>
                    ))}
            </div>
            <div className="min-w-0 space-y-3">
              {version.data && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={() => setPending({ type: "restore", id })}>
                      {t("history.restore")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending({ type: "delete", id })}>
                      {t("common.delete")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("history.diff")}</p>
                  <pre className="max-h-96 overflow-auto rounded border p-2 text-xs whitespace-pre-wrap break-words">
                    {diff.map((line, index) => (
                      <span
                        key={index}
                        className={`block ${line.type === "+" ? "bg-green-500/15" : line.type === "−" ? "bg-destructive/10" : ""}`}
                      >
                        {line.type} {line.text}
                      </span>
                    ))}
                  </pre>
                </>
              )}
            </div>
          </div>
          {!!list.data?.revisions.length && (
            <Button variant="destructive" disabled={busy} onClick={() => setPending({ type: "clear" })}>
              {t("history.clear")}
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        open={!!pending}
        onOpenChange={(open) => !open && !busy && setPending(undefined)}
        title={t(pending?.type === "restore" ? "history.restore" : "history.remove")}
        description={t(pending?.type === "restore" ? "history.restore-description" : "history.remove-description")}
        onConfirm={confirm}
        confirmVariant={pending?.type === "restore" ? "default" : "destructive"}
      />
    </>
  );
};

export default MemoHistoryDialog;
