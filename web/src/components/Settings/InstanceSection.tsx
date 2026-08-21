import { create } from "@bufbuild/protobuf";
import { isEqual } from "lodash-es";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import LocalePicker from "@/components/LocalePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { identityProviderServiceClient } from "@/connect";
import { useInstance } from "@/contexts/InstanceContext";
import useDialog from "@/hooks/useDialog";
import { DEFAULT_MEMO_FEED_PAGE_SIZE, MAX_MEMO_FEED_PAGE_SIZE, MIN_MEMO_FEED_PAGE_SIZE } from "@/lib/constants";
import { IdentityProvider } from "@/types/proto/api/v1/idp_service_pb";
import {
  InstanceSetting_GeneralSetting,
  InstanceSetting_GeneralSettingSchema,
  InstanceSetting_Key,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { isValidLocale, useTranslate } from "@/utils/i18n";
import { isValidTheme, THEME_OPTIONS } from "@/utils/theme";
import UpdateCustomizedProfileDialog from "../UpdateCustomizedProfileDialog";
import InstanceCategoryEditor from "./InstanceCategoryEditor";
import InstanceContentEditor from "./InstanceContentEditor";
import SettingGroup from "./SettingGroup";
import { SettingCodeEditor, SettingList, SettingListItem } from "./SettingList";
import SettingSection from "./SettingSection";
import useInstanceSettingUpdater, { buildInstanceSettingName } from "./useInstanceSettingUpdater";

const InstanceSection = () => {
  const t = useTranslate();
  const customizeDialog = useDialog();
  const saveInstanceSetting = useInstanceSettingUpdater();
  const { generalSetting: originalSetting, profile } = useInstance();
  const [instanceGeneralSetting, setInstanceGeneralSetting] = useState<InstanceSetting_GeneralSetting>(originalSetting);
  const [identityProviderList, setIdentityProviderList] = useState<IdentityProvider[]>([]);

  useEffect(() => {
    setInstanceGeneralSetting(originalSetting);
  }, [originalSetting]);

  const fetchIdentityProviderList = async () => {
    const { identityProviders } = await identityProviderServiceClient.listIdentityProviders({});
    setIdentityProviderList(identityProviders);
  };

  useEffect(() => {
    fetchIdentityProviderList();
  }, []);

  const weekStartDayOptions = useMemo(
    () => [
      { value: "-1", label: t("setting.instance.saturday") },
      { value: "0", label: t("setting.instance.sunday") },
      { value: "1", label: t("setting.instance.monday") },
    ],
    [t],
  );
  const firstVisitDefaultLocale = isValidLocale(instanceGeneralSetting.firstVisitDefaultLocale)
    ? (instanceGeneralSetting.firstVisitDefaultLocale as Locale)
    : "zh-Hans";
  const firstVisitDefaultTheme = isValidTheme(instanceGeneralSetting.firstVisitDefaultTheme)
    ? instanceGeneralSetting.firstVisitDefaultTheme
    : "cosmic-dark";
  const defaultMemberMemoVisibility = ["PRIVATE", "PROTECTED", "PUBLIC"].includes(instanceGeneralSetting.defaultMemberMemoVisibility)
    ? instanceGeneralSetting.defaultMemberMemoVisibility
    : "PUBLIC";
  const themeOptions = THEME_OPTIONS.map((option) => ({ ...option, label: t(option.labelKey) }));

  const updatePartialSetting = (partial: Partial<InstanceSetting_GeneralSetting>) => {
    setInstanceGeneralSetting((currentSetting) =>
      create(InstanceSetting_GeneralSettingSchema, {
        ...currentSetting,
        ...partial,
      }),
    );
  };

  const handleSaveGeneralSetting = async () => {
    await saveInstanceSetting({
      key: InstanceSetting_Key.GENERAL,
      setting: create(InstanceSettingSchema, {
        name: buildInstanceSettingName(InstanceSetting_Key.GENERAL),
        value: {
          case: "generalSetting",
          value: instanceGeneralSetting,
        },
      }),
      errorContext: "Update general settings",
    });
  };

  return (
    <SettingSection title={t("setting.system.label")}>
      <SettingGroup title={t("common.basic")} description={t("setting.system.basic-description")}>
        <SettingList>
          <SettingListItem label={t("setting.system.server-name")} description={instanceGeneralSetting.customProfile?.title || "Memos"}>
            <Button variant="outline" onClick={customizeDialog.open}>
              {t("common.edit")}
            </Button>
          </SettingListItem>
          <SettingListItem
            label={t("setting.system.memo-page-size")}
            description={t("setting.system.memo-page-size-description", {
              min: MIN_MEMO_FEED_PAGE_SIZE,
              max: MAX_MEMO_FEED_PAGE_SIZE,
              default: DEFAULT_MEMO_FEED_PAGE_SIZE,
            })}
          >
            <Input
              type="number"
              min={MIN_MEMO_FEED_PAGE_SIZE}
              max={MAX_MEMO_FEED_PAGE_SIZE}
              className="w-24"
              value={instanceGeneralSetting.memoPageSize || ""}
              placeholder={DEFAULT_MEMO_FEED_PAGE_SIZE.toString()}
              onChange={(event) => {
                const rawValue = event.target.valueAsNumber;
                const memoPageSize = Number.isFinite(rawValue)
                  ? Math.min(MAX_MEMO_FEED_PAGE_SIZE, Math.max(MIN_MEMO_FEED_PAGE_SIZE, Math.trunc(rawValue)))
                  : 0;
                updatePartialSetting({ memoPageSize });
              }}
            />
          </SettingListItem>
          <SettingListItem
            label={t("setting.system.default-background-image")}
            description={t("setting.system.default-background-image-description")}
          >
            <Input
              type="url"
              className="w-80 max-w-full"
              value={instanceGeneralSetting.defaultBackgroundImageUrl}
              placeholder="https://example.com/background.webp"
              onChange={(event) => updatePartialSetting({ defaultBackgroundImageUrl: event.target.value.trim() })}
            />
          </SettingListItem>
        </SettingList>
      </SettingGroup>

      <SettingGroup title={t("setting.system.custom-code-title")} description={t("setting.system.custom-code-description")} showSeparator>
        <SettingCodeEditor
          label={t("setting.system.additional-style")}
          description={t("setting.system.additional-style-description")}
          placeholder={t("setting.system.additional-style-placeholder")}
          value={instanceGeneralSetting.additionalStyle}
          onChange={(additionalStyle) => updatePartialSetting({ additionalStyle })}
        />

        <SettingCodeEditor
          label={t("setting.system.additional-script")}
          description={t("setting.system.additional-script-description")}
          placeholder={t("setting.system.additional-script-placeholder")}
          value={instanceGeneralSetting.additionalScript}
          onChange={(additionalScript) => updatePartialSetting({ additionalScript })}
        />
      </SettingGroup>

      <SettingGroup title={t("setting.content.title")} description={t("setting.content.description")} showSeparator>
        <InstanceContentEditor
          navigationJson={instanceGeneralSetting.navigationJson}
          pagesJson={instanceGeneralSetting.customPagesJson}
          onNavigationChange={(navigationJson) => updatePartialSetting({ navigationJson })}
          onPagesChange={(customPagesJson) => updatePartialSetting({ customPagesJson })}
        />
      </SettingGroup>

      <SettingGroup title={t("setting.category.title")} description={t("setting.category.description")} showSeparator>
        <InstanceCategoryEditor
          value={instanceGeneralSetting.memoCategoriesJson}
          onChange={(memoCategoriesJson) => updatePartialSetting({ memoCategoriesJson })}
        />
      </SettingGroup>

      <SettingGroup title={t("setting.instance.access-title")} description={t("setting.instance.access-description")} showSeparator>
        <SettingList>
          <SettingListItem
            label={t("setting.instance.first-visit-default-language")}
            description={t("setting.instance.first-visit-default-language-description")}
          >
            <LocalePicker
              value={firstVisitDefaultLocale}
              onChange={(firstVisitDefaultLocale) => updatePartialSetting({ firstVisitDefaultLocale })}
              className="w-52"
            />
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.first-visit-default-theme")}
            description={t("setting.instance.first-visit-default-theme-description")}
          >
            <Select
              value={firstVisitDefaultTheme}
              items={themeOptions}
              onValueChange={(firstVisitDefaultTheme) => updatePartialSetting({ firstVisitDefaultTheme })}
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.default-member-memo-visibility")}
            description={t("setting.instance.default-member-memo-visibility-description")}
          >
            <Select
              value={defaultMemberMemoVisibility}
              onValueChange={(defaultMemberMemoVisibility) => updatePartialSetting({ defaultMemberMemoVisibility })}
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["PUBLIC", "PROTECTED", "PRIVATE"] as const).map((visibility) => (
                  <SelectItem key={visibility} value={visibility}>
                    {t(`memo.visibility.${visibility.toLowerCase() as "public" | "protected" | "private"}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.default-member-save-media-metadata")}
            description={t("setting.instance.default-member-save-media-metadata-description")}
          >
            <Switch
              checked={instanceGeneralSetting.defaultMemberSaveMediaMetadata}
              onCheckedChange={(defaultMemberSaveMediaMetadata) => updatePartialSetting({ defaultMemberSaveMediaMetadata })}
            />
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.disallow-user-registration")}
            description={t("setting.instance.disallow-user-registration-description")}
          >
            <Switch
              disabled={profile.demo}
              checked={instanceGeneralSetting.disallowUserRegistration}
              onCheckedChange={(checked) => updatePartialSetting({ disallowUserRegistration: checked })}
            />
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.disallow-password-auth")}
            description={t("setting.instance.disallow-password-auth-description")}
          >
            <Switch
              disabled={profile.demo || (identityProviderList.length === 0 && !instanceGeneralSetting.disallowPasswordAuth)}
              checked={instanceGeneralSetting.disallowPasswordAuth}
              onCheckedChange={(checked) => updatePartialSetting({ disallowPasswordAuth: checked })}
            />
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.disallow-change-username")}
            description={t("setting.instance.disallow-change-username-description")}
          >
            <Switch
              checked={instanceGeneralSetting.disallowChangeUsername}
              onCheckedChange={(checked) => updatePartialSetting({ disallowChangeUsername: checked })}
            />
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.disallow-change-nickname")}
            description={t("setting.instance.disallow-change-nickname-description")}
          >
            <Switch
              checked={instanceGeneralSetting.disallowChangeNickname}
              onCheckedChange={(checked) => updatePartialSetting({ disallowChangeNickname: checked })}
            />
          </SettingListItem>

          <SettingListItem label={t("setting.instance.week-start-day")} description={t("setting.instance.week-start-day-description")}>
            <Select
              value={instanceGeneralSetting.weekStartDayOffset.toString()}
              items={weekStartDayOptions}
              onValueChange={(value) => {
                updatePartialSetting({ weekStartDayOffset: parseInt(value) || 0 });
              }}
            >
              <SelectTrigger className="min-w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekStartDayOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingListItem>
        </SettingList>
      </SettingGroup>

      <div className="w-full flex justify-end">
        <Button disabled={isEqual(instanceGeneralSetting, originalSetting)} onClick={handleSaveGeneralSetting}>
          {t("common.save")}
        </Button>
      </div>

      <UpdateCustomizedProfileDialog
        open={customizeDialog.isOpen}
        onOpenChange={customizeDialog.setOpen}
        onSuccess={() => {
          toast.success(t("message.update-succeed"));
        }}
      />
    </SettingSection>
  );
};

export default InstanceSection;
