import { Switch } from "@/components/ui/switch";
import type { InstanceSetting_GeneralSetting } from "@/types/proto/api/v1/instance_service_pb";
import { EASTER_EGGS } from "@/utils/easter-eggs";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem } from "./SettingList";

interface Props {
  setting: InstanceSetting_GeneralSetting;
  onChange: (value: Partial<InstanceSetting_GeneralSetting>) => void;
  disabled?: boolean;
}

export default function EasterEggSettings({ setting, onChange, disabled }: Props) {
  const t = useTranslate();
  return (
    <SettingGroup title={t("easter-eggs.title")} description={t("easter-eggs.description")} showSeparator>
      <SettingList>
        <SettingListItem label={t("easter-eggs.disable-all")} description={t("easter-eggs.master-hint")}>
          <Switch
            aria-label={t("easter-eggs.disable-all")}
            checked={setting.disableEasterEggs}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ disableEasterEggs: checked })}
          />
        </SettingListItem>
        <SettingListItem label={t("setting.system.festival-effects")} description={t("setting.system.festival-effects-description")}>
          <Switch
            aria-label={t("setting.system.festival-effects")}
            checked={!setting.disableFestivalEffects}
            disabled={disabled || setting.disableEasterEggs}
            onCheckedChange={(checked) => onChange({ disableFestivalEffects: !checked })}
          />
        </SettingListItem>
      </SettingList>
      <details data-settings-surface="" className="mt-3 rounded-lg border border-border bg-background">
        <summary className="cursor-pointer px-3 py-3 text-sm font-medium">{t("easter-eggs.individual")}</summary>
        <div className="divide-y divide-border border-t border-border">
          {EASTER_EGGS.map((id) => (
            <SettingListItem key={id} label={t("easter-eggs.disable-one", { name: t(`easter-eggs.names.${id}`) })}>
              <Switch
                aria-label={t("easter-eggs.disable-one", { name: t(`easter-eggs.names.${id}`) })}
                checked={setting.disabledEasterEggs.includes(id)}
                disabled={disabled || setting.disableEasterEggs}
                onCheckedChange={(checked) =>
                  onChange({
                    disabledEasterEggs: checked
                      ? [...setting.disabledEasterEggs, id]
                      : setting.disabledEasterEggs.filter((value) => value !== id),
                  })
                }
              />
            </SettingListItem>
          ))}
        </div>
      </details>
    </SettingGroup>
  );
}
