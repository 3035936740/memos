import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslate } from "@/utils/i18n";
import { getModerationSecurity, type ModerationSecuritySetting, saveModerationSecurity } from "@/utils/moderation";
import BlockedWordsEditor from "./BlockedWordsEditor";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem } from "./SettingList";
import SettingSection from "./SettingSection";

const defaults: ModerationSecuritySetting = {
  commentReportThreshold: 5,
  articleReportThreshold: 10,
  userReportThreshold: 50,
  userAutoBanInitialDays: 30,
  publishCooldownSeconds: 60,
};
const SecuritySection = () => {
  const t = useTranslate();
  const [setting, setSetting] = useState(defaults);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    getModerationSecurity()
      .then(setSetting)
      .catch((error) => toast.error(error instanceof Error ? error.message : t("setting.security.load-failed")));
  }, [t]);
  const numberField = (key: keyof ModerationSecuritySetting, min: number, max: number) => (
    <Input
      type="number"
      className="w-28"
      min={min}
      max={max}
      value={setting[key]}
      onChange={(event) =>
        setSetting((current) => ({ ...current, [key]: Math.max(min, Math.min(max, Math.trunc(event.target.valueAsNumber || 0))) }))
      }
    />
  );
  return (
    <SettingSection title={t("setting.security.label")} description={t("setting.security.description")}>
      <SettingGroup title={t("setting.security.policy-title")} description={t("setting.security.policy-description")}>
        <SettingList>
          <SettingListItem label={t("setting.security.publish-cooldown")} description={t("setting.security.publish-cooldown-description")}>
            {numberField("publishCooldownSeconds", 0, 86400)}
          </SettingListItem>
          <SettingListItem
            label={t("setting.security.comment-threshold")}
            description={t("setting.security.comment-threshold-description")}
          >
            {numberField("commentReportThreshold", 1, 10000)}
          </SettingListItem>
          <SettingListItem
            label={t("setting.security.article-threshold")}
            description={t("setting.security.article-threshold-description")}
          >
            {numberField("articleReportThreshold", 1, 10000)}
          </SettingListItem>
          <SettingListItem label={t("setting.security.user-threshold")} description={t("setting.security.user-threshold-description")}>
            {numberField("userReportThreshold", 1, 10000)}
          </SettingListItem>
          <SettingListItem label={t("setting.security.initial-ban-days")} description={t("setting.security.initial-ban-days-description")}>
            {numberField("userAutoBanInitialDays", 1, 36500)}
          </SettingListItem>
        </SettingList>
        <div className="flex justify-end">
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                setSetting(await saveModerationSecurity(setting));
                toast.success(t("setting.security.saved"));
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t("setting.security.save-failed"));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? t("common.saving") : t("setting.security.save-policy")}
          </Button>
        </div>
      </SettingGroup>
      <SettingGroup title={t("setting.blocked-words.title")} description={t("setting.blocked-words.description")} showSeparator>
        <BlockedWordsEditor />
      </SettingGroup>
    </SettingSection>
  );
};
export default SecuritySection;
