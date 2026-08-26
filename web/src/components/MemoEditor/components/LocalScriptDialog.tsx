import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslate } from "@/utils/i18n";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onInsert: (script: string, label: string) => void };

const LocalScriptDialog = ({ open, onOpenChange, onInsert }: Props) => {
  const t = useTranslate();
  const [label, setLabel] = useState("Element");
  const [script, setScript] = useState("");
  useEffect(() => {
    if (open) {
      setLabel("Element");
      setScript("");
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t("editor.local-script.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label>{t("editor.local-script.label")}</Label>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("editor.local-script.code")}</Label>
            <Textarea
              className="min-h-48 font-mono text-xs"
              value={script}
              onChange={(event) => setScript(event.target.value)}
              placeholder={t("editor.local-script.placeholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!label.trim() || !script.trim()}
            onClick={() => {
              onInsert(script.trim(), label.trim());
              onOpenChange(false);
            }}
          >
            {t("editor.local-script.insert")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocalScriptDialog;
