import { ListChecksIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BATCH_STATE_EVENT, type BatchStateDetail, requestBatchToggle } from "@/utils/batch-selection";
import { useTranslate } from "@/utils/i18n";

/**
 * The toolbar's batch tidying button. It only shows on pages whose list can be tidied (Home, Archived) and stays
 * pressed while picking; the list itself does the work (MemoSelectionProvider).
 */
const BatchSelectButton = () => {
  const t = useTranslate();
  const [state, setState] = useState<BatchStateDetail>({ available: false, active: false });

  useEffect(() => {
    const update = (event: Event) => setState((event as CustomEvent<BatchStateDetail>).detail);
    window.addEventListener(BATCH_STATE_EVENT, update);
    return () => window.removeEventListener(BATCH_STATE_EVENT, update);
  }, []);

  if (!state.available) return null;
  const label = state.active ? t("memo.batch.finish") : t("memo.batch.start");
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-pressed={state.active}
      aria-label={label}
      title={label}
      className={cn("size-8 text-muted-foreground hover:text-foreground", state.active && "bg-accent text-foreground")}
      onClick={requestBatchToggle}
    >
      <ListChecksIcon className="size-4" />
    </Button>
  );
};

export default BatchSelectButton;
