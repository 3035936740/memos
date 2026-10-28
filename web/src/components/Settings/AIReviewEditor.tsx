import { useEffect } from "react";
import toast from "react-hot-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useInstance } from "@/contexts/InstanceContext";
import { handleError } from "@/lib/error";
import { InstanceSetting_Key } from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import type { AIReviewSetting } from "@/utils/moderation";
import { SettingList, SettingListItem, SettingPanel } from "./SettingList";

const AIReviewEditor = ({ value, onChange }: { value: AIReviewSetting; onChange: (value: AIReviewSetting) => void }) => {
  const t = useTranslate();
  const { aiSetting, fetchSettings } = useInstance();
  useEffect(() => {
    void fetchSettings([InstanceSetting_Key.AI]).catch((error) => handleError(error, toast.error));
  }, [fetchSettings]);
  const update = (partial: Partial<AIReviewSetting>) => onChange({ ...value, ...partial });
  return (
    <div className="space-y-4">
      <SettingList>
        <SettingListItem label={t("ai-review.master")} description={t("ai-review.master-note")}>
          <Switch checked={value.enabled} onCheckedChange={(enabled) => update({ enabled })} />
        </SettingListItem>
      </SettingList>
      {(["text", "image"] as const).map((kind) => {
        const isImage = kind === "image";
        const enabled = isImage ? value.imagesEnabled : value.textEnabled;
        const selected = isImage ? value.imageProviderIds : value.textProviderIds;
        const eligible = aiSetting.providers.filter((provider) => !isImage || provider.supportsVision);
        const prompt = isImage ? value.imagePrompt : value.textPrompt;
        const toggleProvider = (id: string, checked: boolean) => {
          const next = checked ? [...selected, id] : selected.filter((item) => item !== id);
          update(isImage ? { imageProviderIds: next } : { textProviderIds: next });
        };
        return (
          <SettingPanel key={kind} className="p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`ai-review-${kind}`}>{t(`ai-review.${kind}-enabled`)}</Label>
              <Switch
                id={`ai-review-${kind}`}
                checked={enabled}
                onCheckedChange={(checked) => update(isImage ? { imagesEnabled: checked } : { textEnabled: checked })}
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{t(`ai-review.${kind}-note`)}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {eligible.map((provider) => (
                <label
                  key={provider.id}
                  data-settings-surface=""
                  data-settings-option=""
                  className="flex min-w-0 items-center gap-2 rounded-md border p-2 text-sm"
                >
                  <Checkbox
                    checked={selected.includes(provider.id)}
                    disabled={!enabled || (!selected.includes(provider.id) && selected.length >= 8)}
                    onCheckedChange={(checked) => toggleProvider(provider.id, !!checked)}
                  />
                  <span className="min-w-0 break-words">
                    {provider.title}
                    <span className="ml-1 text-xs text-muted-foreground">{provider.defaultModel}</span>
                  </span>
                </label>
              ))}
            </div>
            {eligible.length === 0 && (
              <p className="text-xs text-muted-foreground">{t(isImage ? "ai-review.no-vision" : "ai-review.no-providers")}</p>
            )}
            <Label htmlFor={`ai-review-${kind}-prompt`}>{t("ai-review.prompt")}</Label>
            <Textarea
              id={`ai-review-${kind}-prompt`}
              value={prompt}
              disabled={!enabled}
              rows={4}
              maxLength={4000}
              placeholder={t(`ai-review.${kind}-default`)}
              onChange={(event) => update(isImage ? { imagePrompt: event.target.value } : { textPrompt: event.target.value })}
            />
          </SettingPanel>
        );
      })}
      <p className="text-xs leading-5 text-muted-foreground">{t("ai-review.decision-note")}</p>
    </div>
  );
};
export default AIReviewEditor;
