import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslate } from "@/utils/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<void>;
}

const ReportDialog = ({ open, onOpenChange, onSubmit }: Props) => {
  const t = useTranslate();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("moderation.report")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="moderation-report-reason">{t("moderation.report-reason")}</Label>
          <Textarea
            id="moderation-report-reason"
            value={reason}
            maxLength={500}
            rows={4}
            className="min-h-24 resize-y"
            autoFocus
            onChange={(event) => setReason(event.target.value)}
          />
          <span className="text-right text-xs text-muted-foreground">{reason.length} / 500</span>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? "…" : t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
