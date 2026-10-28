import { CheckIcon, ListChecksIcon } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import PrivacyCheckDialog from "@/components/MemoEditor/components/PrivacyCheckDialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import VisibilityIcon from "@/components/VisibilityIcon";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useDeleteMemo, useUpdateMemo } from "@/hooks/useMemoQueries";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import { type Memo, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { findPrivateInfo, type PrivacyFinding } from "@/utils/privacy-check";
import { isSuperUser } from "@/utils/user";

/** Requests sent at once while a batch runs, so a large selection does not flood a small server. */
const BATCH_CONCURRENCY = 3;

const VISIBILITY_CHOICES = [
  { value: Visibility.PUBLIC, labelKey: "memo.visibility.public" },
  { value: Visibility.PROTECTED, labelKey: "memo.visibility.protected" },
  { value: Visibility.PRIVATE, labelKey: "memo.visibility.private" },
] as const;

interface MemoSelectionValue {
  active: boolean;
  selected: ReadonlySet<string>;
  canSelect: (memo: Memo) => boolean;
  toggle: (name: string) => void;
}

const MemoSelectionContext = createContext<MemoSelectionValue | undefined>(undefined);

interface ProviderProps {
  /** The memos on the current page; the selection never reaches beyond them. */
  memos: Memo[];
  enabled: boolean;
  children: ReactNode;
}

interface BatchState {
  enabled: boolean;
  memos: Memo[];
  active: boolean;
  setActive: (active: boolean) => void;
  selected: ReadonlySet<string>;
  setSelected: (selected: ReadonlySet<string>) => void;
  canSelect: (memo: Memo) => boolean;
}

const BatchStateContext = createContext<BatchState | undefined>(undefined);

/**
 * Batch tidying for a memo list the visitor owns (Home, Archived): pick memos on the page, then change their
 * visibility, pin, archive, restore or delete them together. Only memos the visitor may manage can be picked.
 */
export const MemoSelectionProvider = ({ memos, enabled, children }: ProviderProps) => {
  const currentUser = useCurrentUser();
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // Memos that leave the page (another page, a filter, an archive) leave the selection too.
  useEffect(() => {
    setSelected((current) => {
      const names = new Set(memos.map((memo) => memo.name));
      const kept = [...current].filter((name) => names.has(name));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [memos]);

  const batch = useMemo<BatchState>(
    () => ({
      enabled,
      memos,
      active: enabled && active,
      setActive,
      selected,
      setSelected,
      canSelect: (memo) => memo.creator === currentUser?.name || !!isSuperUser(currentUser),
    }),
    [active, currentUser, enabled, memos, selected],
  );
  const selection = useMemo<MemoSelectionValue>(
    () => ({
      active: batch.active,
      selected,
      canSelect: batch.canSelect,
      toggle: (name) =>
        setSelected((current) => {
          const next = new Set(current);
          if (!next.delete(name)) next.add(name);
          return next;
        }),
    }),
    [batch.active, batch.canSelect, selected],
  );

  return (
    <BatchStateContext.Provider value={batch}>
      <MemoSelectionContext.Provider value={selection}>{children}</MemoSelectionContext.Provider>
    </BatchStateContext.Provider>
  );
};

/** Wraps one memo card; while picking, a click on the card picks it instead of opening it. */
export const SelectableMemo = ({ memo, children }: { memo: Memo; children: ReactNode }) => {
  const t = useTranslate();
  const selection = useContext(MemoSelectionContext);
  if (!selection?.active || !selection.canSelect(memo)) return children;
  const picked = selection.selected.has(memo.name);
  const title = memo.property?.title || memo.snippet || memo.name;

  return (
    <div data-memo-selectable="" data-selected={picked || undefined} className="relative">
      {children}
      <button
        type="button"
        aria-pressed={picked}
        aria-label={t("memo.batch.pick", { title })}
        onClick={() => selection.toggle(memo.name)}
        className={cn(
          "absolute inset-0 z-10 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          picked ? "bg-primary/5 ring-2 ring-primary ring-inset" : "hover:bg-foreground/[0.03]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute end-3 top-3 flex size-5 items-center justify-center rounded-md border-2",
            picked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60 bg-background",
          )}
        >
          {picked && <CheckIcon className="size-3.5" strokeWidth={3} />}
        </span>
      </button>
    </div>
  );
};

/** Runs `action` over `items` a few at a time; resolves with how many failed. */
const runInBatches = async <T,>(items: T[], action: (item: T) => Promise<unknown>) => {
  let failed = 0;
  for (let start = 0; start < items.length; start += BATCH_CONCURRENCY) {
    const results = await Promise.allSettled(items.slice(start, start + BATCH_CONCURRENCY).map(action));
    failed += results.filter((result) => result.status === "rejected").length;
  }
  return failed;
};

/**
 * The batch bar above a list: a button that starts picking, then, while picking, the count, select-all for the
 * page and the actions. Renders nothing on lists without batch tidying.
 */
export const MemoBatchBar = ({ className }: { className?: string }) => {
  const batch = useContext(BatchStateContext);
  // Lists without batch tidying never load the update and delete mutations.
  if (!batch?.enabled) return null;
  return <BatchBar batch={batch} className={className} />;
};

const BatchBar = ({ batch, className }: { batch: BatchState; className?: string }) => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { mutateAsync: updateMemo } = useUpdateMemo();
  const { mutateAsync: deleteMemo } = useDeleteMemo();
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [privacyFindings, setPrivacyFindings] = useState<PrivacyFinding[]>([]);

  const { memos, active, setActive, selected, setSelected, canSelect } = batch;
  const pickable = memos.filter(canSelect);
  const picked = pickable.filter((memo) => selected.has(memo.name));
  const allPicked = pickable.length > 0 && picked.length === pickable.length;
  const archived = picked.length > 0 && picked.every((memo) => memo.state === State.ARCHIVED);

  if (!active) {
    if (pickable.length === 0) return null;
    return (
      <div className={cn("flex justify-end", className)}>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setActive(true)}>
          <ListChecksIcon className="size-4" />
          {t("memo.batch.start")}
        </Button>
      </div>
    );
  }

  const finish = () => {
    setSelected(new Set());
    setActive(false);
  };

  const run = async (action: (memo: Memo) => Promise<unknown>) => {
    const targets = picked;
    setBusy(true);
    const failed = await runInBatches(targets, action);
    setBusy(false);
    setSelected(new Set());
    const done = targets.length - failed;
    if (failed > 0) toast.error(t("memo.batch.partly-done", { done, failed }));
    else toast.success(t("memo.batch.done", { count: done }));
  };

  // Memos already in the wanted state are skipped rather than sent again.
  const setVisibility = (visibility: Visibility) =>
    run(async (memo) => {
      if (memo.visibility !== visibility) await updateMemo({ update: { name: memo.name, visibility }, updateMask: ["visibility"] });
    });

  // Going public passes the same privacy check as the editor, over every memo that is not public yet.
  const makePublic = () => {
    const findings = picked
      .filter((memo) => memo.visibility !== Visibility.PUBLIC)
      .flatMap((memo) => findPrivateInfo(memo.content))
      .filter((finding, index, all) => all.findIndex((other) => other.kind === finding.kind && other.text === finding.text) === index);
    if (findings.length > 0) setPrivacyFindings(findings);
    else void setVisibility(Visibility.PUBLIC);
  };

  const setPinned = (pinned: boolean) =>
    run(async (memo) => {
      if (memo.pinned !== pinned) await updateMemo({ update: { name: memo.name, pinned }, updateMask: ["pinned"] });
    });

  const setState = (state: State) => run((memo) => updateMemo({ update: { name: memo.name, state }, updateMask: ["state"] }));

  const disabled = busy || picked.length === 0;

  return (
    <div
      data-memo-batch-bar=""
      className={cn(
        "sticky top-16 z-20 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-card/95 px-3 py-2 shadow-sm",
        className,
      )}
    >
      <span className="text-sm tabular-nums">{t("memo.batch.count", { count: picked.length })}</span>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => setSelected(new Set(allPicked ? [] : pickable.map((memo) => memo.name)))}
      >
        {allPicked ? t("memo.batch.pick-none") : t("memo.batch.pick-page")}
      </Button>
      <div className="ms-auto flex flex-wrap items-center gap-1">
        {!archived && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" disabled={disabled} />}>
              {t("common.visibility")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={2}>
              {VISIBILITY_CHOICES.map((choice) => (
                <DropdownMenuItem
                  key={choice.value}
                  onClick={() => (choice.value === Visibility.PUBLIC ? makePublic() : void setVisibility(choice.value))}
                >
                  <VisibilityIcon visibility={choice.value} />
                  {t(choice.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!archived && isSuperUser(currentUser) && (
          <>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void setPinned(true)}>
              {t("common.pin")}
            </Button>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void setPinned(false)}>
              {t("common.unpin")}
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void setState(archived ? State.NORMAL : State.ARCHIVED)}>
          {archived ? t("common.restore") : t("common.archive")}
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" disabled={disabled} onClick={() => setConfirmingDelete(true)}>
          {t("common.delete")}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={finish}>
          {t("memo.batch.finish")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("memo.batch.delete-title", { count: picked.length })}
        description={t("memo.batch.delete-description")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        confirmVariant="destructive"
        onConfirm={() => run((memo) => deleteMemo(memo.name))}
      />
      <PrivacyCheckDialog
        findings={privacyFindings}
        description={t("memo.batch.privacy-description")}
        onKeepEditing={() => setPrivacyFindings([])}
        onPublish={() => {
          setPrivacyFindings([]);
          void setVisibility(Visibility.PUBLIC);
        }}
      />
    </div>
  );
};
