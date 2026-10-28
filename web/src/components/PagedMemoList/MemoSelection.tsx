import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  ListChecksIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react";
import { createContext, type PointerEvent, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import { announceBatchState, BATCH_TOGGLE_EVENT } from "@/utils/batch-selection";
import { useTranslate } from "@/utils/i18n";
import { findPrivateInfo, type PrivacyFinding } from "@/utils/privacy-check";
import { isSuperUser } from "@/utils/user";

/** Requests sent at once while a batch runs, so a large selection does not flood a small server. */
const BATCH_CONCURRENCY = 3;
/** On touch screens, holding a card this long starts picking with it. */
const LONG_PRESS_MS = 500;
/** A finger that wanders further than this is scrolling, not holding. */
const LONG_PRESS_SLOP_PX = 10;

const VISIBILITY_CHOICES = [
  { value: Visibility.PUBLIC, labelKey: "memo.visibility.public" },
  { value: Visibility.PROTECTED, labelKey: "memo.visibility.protected" },
  { value: Visibility.PRIVATE, labelKey: "memo.visibility.private" },
] as const;

interface MemoSelectionValue {
  enabled: boolean;
  active: boolean;
  /** Starts picking with this memo already picked. */
  start: (name: string) => void;
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

  // The toolbar's batch button (outside this list) toggles picking; tell it whenever that changes.
  useEffect(() => {
    if (!enabled) return;
    const toggle = () => {
      setSelected(new Set());
      setActive((current) => !current);
    };
    window.addEventListener(BATCH_TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(BATCH_TOGGLE_EVENT, toggle);
  }, [enabled]);

  useEffect(() => {
    announceBatchState({ available: enabled, active: enabled && active });
  }, [active, enabled]);

  useEffect(
    () => () => {
      announceBatchState({ available: false, active: false });
    },
    [],
  );

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
      enabled,
      active: batch.active,
      start: (name) => {
        setSelected(new Set([name]));
        setActive(true);
      },
      selected,
      canSelect: batch.canSelect,
      toggle: (name) =>
        setSelected((current) => {
          const next = new Set(current);
          if (!next.delete(name)) next.add(name);
          return next;
        }),
    }),
    [batch.active, batch.canSelect, enabled, selected],
  );

  return (
    <BatchStateContext.Provider value={batch}>
      <MemoSelectionContext.Provider value={selection}>{children}</MemoSelectionContext.Provider>
    </BatchStateContext.Provider>
  );
};

/**
 * Wraps one memo card. Picking starts from the toolbar's batch button, or by holding a card on a touch screen.
 * While picking, a rail runs down the left of every card with a mark at its top; the whole card toggles it. Each style
 * draws its own rail and mark (themes/memo-pick.css), on elements no other rule in the app touches.
 */
export const SelectableMemo = ({ memo, children }: { memo: Memo; children: ReactNode }) => {
  const t = useTranslate();
  const selection = useContext(MemoSelectionContext);
  const press = useRef<{ timer: number; x: number; y: number }>(undefined);
  // Set when a long press started picking, so the click that ends the press does not also open the card.
  const pressStarted = useRef(false);
  if (!selection?.enabled || !selection.canSelect(memo)) return children;
  const picked = selection.selected.has(memo.name);
  const title = memo.property?.title || memo.snippet || memo.name;

  if (!selection.active) {
    const cancelPress = () => {
      if (press.current) window.clearTimeout(press.current.timer);
      press.current = undefined;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pressStarted.current = false;
      cancelPress();
      const timer = window.setTimeout(() => {
        pressStarted.current = true;
        press.current = undefined;
        navigator.vibrate?.(10);
        selection.start(memo.name);
      }, LONG_PRESS_MS);
      press.current = { timer, x: event.clientX, y: event.clientY };
    };
    const handlePointerMove = (event: PointerEvent) => {
      const start = press.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP_PX) cancelPress();
    };

    return (
      <div
        data-memo-selectable=""
        className="relative"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        // A held finger would otherwise also open the browser's link menu.
        onContextMenu={(event) => pressStarted.current && event.preventDefault()}
        onClickCapture={(event) => {
          if (!pressStarted.current) return;
          pressStarted.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div data-memo-selectable="" data-memo-selection-active="" data-selected={picked || undefined} className="relative ps-9">
      {children}
      {/* Layout only; every style draws the rail and mark in themes/memo-pick.css. */}
      <span
        data-memo-pick-rail=""
        aria-hidden
        className="pointer-events-none absolute inset-y-0 start-0 z-10 flex w-7 justify-center pt-2.5"
      >
        <span data-memo-pick-mark="" className="relative flex size-5 shrink-0 items-center justify-center">
          <CheckIcon data-memo-pick-check="" className="size-3" strokeWidth={3.5} />
        </span>
      </span>
      {picked && <span data-memo-selection-wash="" aria-hidden className="pointer-events-none absolute inset-y-0 start-9 end-0 z-10" />}
      <button
        data-memo-selection-overlay=""
        type="button"
        aria-pressed={picked}
        aria-label={t("memo.batch.pick", { title })}
        onClick={() => selection.toggle(memo.name)}
        className="absolute inset-0 z-10 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
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
 * The batch bar above a list while picking: the count, select-all for the page and the actions. Renders nothing
 * before picking starts or on lists without batch tidying.
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

  // Picking starts from a card itself (SelectableMemo), so there is no bar until then.
  if (!active) return null;

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
      data-settings-surface=""
      role="toolbar"
      aria-label={t("memo.batch.toolbar")}
      className={cn(
        "sticky top-16 z-20 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/95 px-2 py-1.5 shadow-sm",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 px-1.5 text-sm font-medium tabular-nums text-foreground">
        <ListChecksIcon aria-hidden className="size-4 text-primary" />
        {t("memo.batch.count", { count: picked.length })}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => setSelected(new Set(allPicked ? [] : pickable.map((memo) => memo.name)))}
      >
        {allPicked ? t("memo.batch.pick-none") : t("memo.batch.pick-page")}
      </Button>
      <span data-memo-batch-separator="" aria-hidden className="mx-1 h-5 w-px bg-border" />
      <div className="flex flex-wrap items-center gap-0.5">
        {!archived && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" disabled={disabled} title={t("common.visibility")} aria-label={t("common.visibility")} />
              }
            >
              <EyeIcon aria-hidden />
              <span className="hidden sm:inline">{t("common.visibility")}</span>
              <ChevronDownIcon aria-hidden className="opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
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
            <Button variant="ghost" size="sm" disabled={disabled} title={t("common.pin")} onClick={() => void setPinned(true)}>
              <PinIcon aria-hidden />
              <span className="hidden sm:inline">{t("common.pin")}</span>
            </Button>
            <Button variant="ghost" size="sm" disabled={disabled} title={t("common.unpin")} onClick={() => void setPinned(false)}>
              <PinOffIcon aria-hidden />
              <span className="hidden sm:inline">{t("common.unpin")}</span>
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          title={archived ? t("common.restore") : t("common.archive")}
          onClick={() => void setState(archived ? State.NORMAL : State.ARCHIVED)}
        >
          {archived ? <ArchiveRestoreIcon aria-hidden /> : <ArchiveIcon aria-hidden />}
          <span className="hidden sm:inline">{archived ? t("common.restore") : t("common.archive")}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={disabled}
          title={t("common.delete")}
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2Icon aria-hidden />
          <span className="hidden sm:inline">{t("common.delete")}</span>
        </Button>
      </div>
      <Button size="sm" className="ms-auto" disabled={busy} onClick={finish}>
        <CheckIcon aria-hidden />
        {t("memo.batch.finish")}
      </Button>

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
