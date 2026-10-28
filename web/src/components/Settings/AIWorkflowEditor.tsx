import { create } from "@bufbuild/protobuf";
import { isEqual } from "lodash-es";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  InstanceSetting_AISetting,
  InstanceSetting_AISettingSchema,
  InstanceSetting_Key,
  InstanceSetting_TextGenerationConfigSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import { SettingPanel } from "./SettingList";
import useInstanceSettingUpdater, { buildInstanceSettingName } from "./useInstanceSettingUpdater";

const AIWorkflowEditor = ({ setting, providers }: { setting: InstanceSetting_AISetting; providers: { id: string; title: string }[] }) => {
  const t = useTranslate();
  const save = useInstanceSettingUpdater();
  const initial = useMemo(() => create(InstanceSetting_TextGenerationConfigSchema, setting.textGeneration), [setting.textGeneration]);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(initial), [initial]);
  const options = [
    { value: "__none__", label: t("ai-options.choose-provider") },
    ...providers.map((provider) => ({ value: provider.id, label: provider.title })),
  ];
  const saveWorkflow = async () => {
    setSaving(true);
    try {
      await save({
        key: InstanceSetting_Key.AI,
        setting: create(InstanceSettingSchema, {
          name: buildInstanceSettingName(InstanceSetting_Key.AI),
          value: { case: "aiSetting", value: create(InstanceSetting_AISettingSchema, { ...setting, textGeneration: draft }) },
        }),
        errorContext: "Save AI writing workflow",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <SettingGroup
      title={t("ai-options.workflow-title")}
      description={t("ai-options.workflow-note")}
      showSeparator
      actions={
        <Button
          disabled={
            saving ||
            isEqual(draft, initial) ||
            (draft.enabled &&
              ![draft.planningProviderId, draft.generationProviderId].every((id) => providers.some((provider) => provider.id === id)))
          }
          onClick={() => void saveWorkflow()}
        >
          {t("common.save")}
        </Button>
      }
    >
      <SettingPanel className="p-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="ai-workflow-enabled">{t("ai-options.workflow-enable")}</Label>
          <Switch
            id="ai-workflow-enabled"
            checked={draft.enabled}
            onCheckedChange={(enabled) =>
              setDraft((current) => create(InstanceSetting_TextGenerationConfigSchema, { ...current, enabled }))
            }
          />
        </div>
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          {(["planning", "generation"] as const).map((stage) => {
            const providerKey = `${stage}ProviderId` as const;
            const modelKey = `${stage}Model` as const;
            return (
              <div key={stage} className="flex min-w-0 flex-col gap-2">
                <Label>{t(`ai-options.${stage}`)}</Label>
                <Select
                  value={draft[providerKey] || "__none__"}
                  items={options}
                  disabled={!draft.enabled}
                  onValueChange={(value) =>
                    setDraft((current) =>
                      create(InstanceSetting_TextGenerationConfigSchema, { ...current, [providerKey]: value === "__none__" ? "" : value }),
                    )
                  }
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={t(`ai-options.${stage}-model`)}
                  disabled={!draft.enabled}
                  maxLength={256}
                  value={draft[modelKey]}
                  placeholder={t("ai-options.provider-default")}
                  onChange={(event) =>
                    setDraft((current) =>
                      create(InstanceSetting_TextGenerationConfigSchema, { ...current, [modelKey]: event.target.value }),
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </SettingPanel>
    </SettingGroup>
  );
};

export default AIWorkflowEditor;
