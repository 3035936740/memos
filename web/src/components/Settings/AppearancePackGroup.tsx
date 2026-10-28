import { DownloadIcon, UploadIcon, WandSparklesIcon } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { InstanceSetting_GeneralSetting } from "@/types/proto/api/v1/instance_service_pb";
import {
  type AppearancePack,
  buildAppearancePack,
  externalHostsOf,
  isPoweredByHidden,
  parseAppearancePack,
  setPoweredByHidden,
} from "@/utils/appearance-pack";
import { blogStyleLabelKey } from "@/utils/blog-style";
import { useTranslate } from "@/utils/i18n";
import { OPEN_SETUP_EVENT } from "@/utils/setup-wizard";
import { THEME_OPTIONS } from "@/utils/theme";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem } from "./SettingList";

interface Props {
  setting: InstanceSetting_GeneralSetting;
  onChange: (partial: Partial<InstanceSetting_GeneralSetting>) => void;
}

/**
 * Memos Plus extras in Settings → System: export the site's look as an appearance pack or import one (the result
 * waits for Save like any other change), the "powered by" line, and the setup wizard.
 */
const AppearancePackGroup = ({ setting, onChange }: Props) => {
  const t = useTranslate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<AppearancePack>();

  const handleExport = () => {
    const pack = buildAppearancePack(setting, setting.customProfile?.title || "Memos Plus");
    const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `memos-plus-appearance-${pack.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = parseAppearancePack(await file.text());
    if ("error" in result) {
      toast.error(t(`memos-plus.pack-error-${result.error}`));
      return;
    }
    setPending(result.pack);
  };

  const describePending = (pack: AppearancePack) => {
    const { appearance } = pack;
    const theme = THEME_OPTIONS.find((option) => option.value === appearance.firstVisitDefaultTheme);
    const parts = [
      appearance.firstVisitDefaultStyle && t("memos-plus.pack-style", { style: t(blogStyleLabelKey(appearance.firstVisitDefaultStyle)) }),
      theme && t("memos-plus.pack-theme", { theme: t(theme.labelKey) }),
      appearance.defaultBackgroundImageUrl && t("memos-plus.pack-background"),
      appearance.additionalStyle && t("memos-plus.pack-css", { count: appearance.additionalStyle.length }),
    ].filter(Boolean);
    const hosts = externalHostsOf(appearance);
    return [
      t("memos-plus.pack-will-set", { items: parts.join(t("memos-plus.list-separator")) || t("memos-plus.pack-nothing") }),
      hosts.length > 0 ? t("memos-plus.pack-external", { hosts: hosts.join(t("memos-plus.list-separator")) }) : "",
      t("memos-plus.pack-save-hint"),
    ]
      .filter(Boolean)
      .join(" ");
  };

  const applyPending = () => {
    if (!pending) return;
    const { appearance } = pending;
    onChange({
      ...(appearance.firstVisitDefaultStyle ? { firstVisitDefaultStyle: appearance.firstVisitDefaultStyle } : {}),
      ...(appearance.firstVisitDefaultTheme ? { firstVisitDefaultTheme: appearance.firstVisitDefaultTheme } : {}),
      defaultBackgroundImageUrl: appearance.defaultBackgroundImageUrl,
      // The site keeps its own choice about the "powered by" line.
      additionalStyle: setPoweredByHidden(appearance.additionalStyle, isPoweredByHidden(setting.additionalStyle)),
    });
    setPending(undefined);
  };

  return (
    <SettingGroup title={t("memos-plus.group-title")} description={t("memos-plus.group-description")} showSeparator>
      <SettingList>
        <SettingListItem label={t("memos-plus.pack")} description={t("memos-plus.pack-description")}>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <DownloadIcon className="size-4" />
              {t("memos-plus.pack-export")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <UploadIcon className="size-4" />
              {t("memos-plus.pack-import")}
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => void handleFile(event)} />
          </div>
        </SettingListItem>
        <SettingListItem label={t("memos-plus.powered-by")} description={t("memos-plus.powered-by-description")}>
          <Switch
            aria-label={t("memos-plus.powered-by")}
            checked={setting.showPoweredBy ?? !isPoweredByHidden(setting.additionalStyle)}
            onCheckedChange={(checked: boolean) =>
              onChange({ showPoweredBy: checked, additionalStyle: setPoweredByHidden(setting.additionalStyle, false) })
            }
          />
        </SettingListItem>
        <SettingListItem label={t("memos-plus.setup")} description={t("memos-plus.setup-description")}>
          <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event(OPEN_SETUP_EVENT))}>
            <WandSparklesIcon className="size-4" />
            {t("memos-plus.setup-open")}
          </Button>
        </SettingListItem>
        <SettingListItem label={t("memos-plus.hide-about")} description={t("memos-plus.hide-about-description")}>
          <Switch
            aria-label={t("memos-plus.hide-about")}
            checked={setting.hideAboutNavigation}
            onCheckedChange={(checked: boolean) => onChange({ hideAboutNavigation: checked })}
          />
        </SettingListItem>
      </SettingList>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(undefined)}
        title={t("memos-plus.pack-confirm-title", { name: pending?.name || t("memos-plus.pack-unnamed") })}
        description={pending ? describePending(pending) : undefined}
        confirmLabel={t("memos-plus.pack-import")}
        cancelLabel={t("common.cancel")}
        onConfirm={applyPending}
      />
    </SettingGroup>
  );
};

export default AppearancePackGroup;
