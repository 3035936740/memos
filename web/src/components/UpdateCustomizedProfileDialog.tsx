import { create } from "@bufbuild/protobuf";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useInstance } from "@/contexts/InstanceContext";
import { handleError } from "@/lib/error";
import { buildInstanceSettingName } from "@/lib/resource-names";
import {
  InstanceSetting_GeneralSetting_CustomProfile,
  InstanceSetting_GeneralSetting_CustomProfileSchema,
  InstanceSetting_Key,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import { SiteImageField } from "./Settings/SiteImageInput";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function UpdateCustomizedProfileDialog({ open, onOpenChange, onSuccess }: Props) {
  const t = useTranslate();
  const { generalSetting: instanceGeneralSetting, updateSetting, profile } = useInstance();
  const [customProfile, setCustomProfile] = useState<InstanceSetting_GeneralSetting_CustomProfile>(
    create(InstanceSetting_GeneralSetting_CustomProfileSchema, instanceGeneralSetting.customProfile || {}),
  );

  const [isLoading, setIsLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageRevision, setImageRevision] = useState(0);
  const busy = isLoading || imageUploading;

  useEffect(() => {
    if (!open) return;
    const current = create(InstanceSetting_GeneralSetting_CustomProfileSchema, instanceGeneralSetting.customProfile);
    current.title ||= "Memos Plus";
    current.logoUrl ||= "/logo.svg";
    setCustomProfile(current);
    setImageRevision((revision) => revision + 1);
  }, [open, instanceGeneralSetting.customProfile]);

  const setPartialState = (partialState: Partial<InstanceSetting_GeneralSetting_CustomProfile>) => {
    setCustomProfile((state) => ({
      ...state,
      ...partialState,
    }));
  };

  const handleNameChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPartialState({
      title: e.target.value as string,
    });
  };

  const handleDescriptionChanged = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPartialState({
      description: e.target.value as string,
    });
  };

  const handleRestoreButtonClick = () => {
    setPartialState({
      title: "Memos Plus",
      logoUrl: "/logo.svg",
      description: "",
      defaultAvatarUrl: "",
    });
    setImageRevision((revision) => revision + 1);
  };

  const handleCloseButtonClick = () => {
    onOpenChange(false);
  };

  const handleSaveButtonClick = async () => {
    if (busy) return;
    if (customProfile.title === "") {
      toast.error("Title cannot be empty.");
      return;
    }

    setIsLoading(true);
    try {
      await updateSetting(
        create(InstanceSettingSchema, {
          name: buildInstanceSettingName(InstanceSetting_Key.GENERAL),
          value: {
            case: "generalSetting",
            value: {
              ...instanceGeneralSetting,
              customProfile: customProfile,
            },
          },
        }),
      );
      toast.success(t("message.update-succeed"));
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      handleError(error, toast.error, {
        context: "Update customized profile",
        fallbackMessage: "Failed to update profile",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("setting.system.customize-server.title")}</DialogTitle>
          <DialogDescription>{t("setting.system.customize-server-description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="server-name">{t("setting.system.server-name")}</Label>
            <Input id="server-name" type="text" value={customProfile.title} onChange={handleNameChanged} placeholder="Enter server name" />
          </div>

          <div className="grid gap-2">
            <Label>{t("setting.system.logo-label")}</Label>
            <SiteImageField
              key={imageRevision}
              kind="logo"
              value={customProfile.logoUrl}
              disabled={profile.demo || isLoading}
              onChange={(logoUrl) => setPartialState({ logoUrl })}
              onUploadingChange={setImageUploading}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">{t("setting.system.customize-server.description")}</Label>
            <Textarea
              id="description"
              rows={3}
              value={customProfile.description}
              onChange={handleDescriptionChanged}
              placeholder="Enter description"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
          <Button variant="outline" onClick={handleRestoreButtonClick} disabled={busy} className="sm:mr-auto">
            {t("setting.system.image-restore-default")}
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="ghost" onClick={handleCloseButtonClick} disabled={busy} className="flex-1 sm:flex-initial">
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveButtonClick} disabled={busy} className="flex-1 sm:flex-initial">
              {isLoading ? "Saving..." : t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UpdateCustomizedProfileDialog;
