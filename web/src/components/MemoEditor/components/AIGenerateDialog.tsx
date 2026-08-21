import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { aiServiceClient } from "@/connect";
import { useInstance } from "@/contexts/InstanceContext";
import { handleError } from "@/lib/error";
import { useTranslate } from "@/utils/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: string;
  onInsert: (text: string) => void;
}

const AIGenerateDialog = ({ open, onOpenChange, context, onInsert }: Props) => {
  const t = useTranslate();
  const { aiSetting } = useInstance();
  const providers = aiSetting.providers;
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const providerOptions = useMemo(() => providers.map((provider) => ({ value: provider.id, label: provider.title })), [providers]);

  useEffect(() => {
    if (!providers.some((provider) => provider.id === providerId)) {
      setProviderId(providers[0]?.id ?? "");
    }
  }, [providerId, providers]);

  const handleGenerate = async () => {
    if (!providerId || !prompt.trim()) {
      toast.error(t("editor.ai.prompt-required"));
      return;
    }
    setGenerating(true);
    try {
      const response = await aiServiceClient.generateText({
        providerId,
        model: model.trim(),
        prompt: prompt.trim(),
        context,
      });
      onInsert(response.text);
      setPrompt("");
      onOpenChange(false);
      toast.success(t("editor.ai.generated"));
    } catch (error) {
      handleError(error, toast.error, { context: "Generate AI text" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("editor.ai.title")}</DialogTitle>
          <DialogDescription>{t("editor.ai.description")}</DialogDescription>
        </DialogHeader>
        {providers.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{t("editor.ai.no-provider")}</p>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("setting.ai.transcription-provider")}</Label>
              <Select value={providerId} items={providerOptions} onValueChange={setProviderId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-model">{t("setting.ai.transcription-model")}</Label>
              <Input
                id="ai-model"
                value={model}
                placeholder={t("editor.ai.default-model")}
                onChange={(event) => setModel(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-prompt">{t("editor.ai.prompt")}</Label>
              <Textarea
                id="ai-prompt"
                className="min-h-28"
                value={prompt}
                placeholder={t("editor.ai.prompt-placeholder")}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("editor.ai.context-note")}</p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={generating} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={generating || providers.length === 0} onClick={() => void handleGenerate()}>
            {generating ? t("editor.ai.generating") : t("editor.ai.generate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AIGenerateDialog;
