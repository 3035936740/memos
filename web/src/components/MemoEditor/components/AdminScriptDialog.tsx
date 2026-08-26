import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useTranslate } from "@/utils/i18n";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; value: string; onChange: (value: string) => void };

const AdminScriptDialog = ({ open, onOpenChange, value, onChange }: Props) => {
  const t = useTranslate();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t("editor.admin-script.title")}</DialogTitle>
        </DialogHeader>
        <Textarea
          className="min-h-56 font-mono text-xs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("editor.admin-script.placeholder")}
        />
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onChange("");
              onOpenChange(false);
            }}
          >
            {t("editor.admin-script.clear")}
          </Button>
          <Button
            onClick={() => {
              onChange(draft);
              onOpenChange(false);
            }}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminScriptDialog;
