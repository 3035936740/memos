import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { userServiceClient } from "@/connect";
import useLoading from "@/hooks/useLoading";
import { handleError } from "@/lib/error";
import { State } from "@/types/proto/api/v1/common_pb";
import { User, User_Role, UserSchema } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";
import { banUser, getUserBan, type UserBanInfo, unbanUser } from "@/utils/moderation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User;
  onSuccess?: () => void;
}

function CreateUserDialog({ open, onOpenChange, user: initialUser, onSuccess }: Props) {
  const t = useTranslate();
  const [user, setUser] = useState(
    create(UserSchema, initialUser ? { name: initialUser.name, username: initialUser.username, role: initialUser.role } : {}),
  );
  const requestState = useLoading(false);
  const isCreating = !initialUser;
  const [banDays, setBanDays] = useState("");
  const [banInfo, setBanInfo] = useState<UserBanInfo | undefined>();
  const [changingBan, setChangingBan] = useState(false);

  useEffect(() => {
    if (initialUser) {
      setUser(create(UserSchema, { name: initialUser.name, username: initialUser.username, role: initialUser.role }));
    } else {
      setUser(create(UserSchema, {}));
    }
    setBanDays("");
    setBanInfo(undefined);
    if (open && initialUser) {
      getUserBan(initialUser.name)
        .then(setBanInfo)
        .catch(() => setBanInfo(undefined));
    }
  }, [initialUser, open]);

  const finishBanChange = () => {
    onSuccess?.();
    onOpenChange(false);
  };

  const handleBan = async () => {
    if (!initialUser) return;
    const trimmed = banDays.trim();
    const days = trimmed === "" ? undefined : Number(trimmed);
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 36500)) {
      toast.error(t("setting.member.ban-days-invalid"));
      return;
    }
    setChangingBan(true);
    try {
      await banUser(initialUser.name, days);
      toast.success(days === undefined ? t("setting.member.banned-permanently") : t("setting.member.banned-days", { days }));
      finishBanChange();
    } catch (error) {
      handleError(error, toast.error, { context: "Ban user" });
    } finally {
      setChangingBan(false);
    }
  };

  const handleUnban = async () => {
    if (!initialUser) return;
    setChangingBan(true);
    try {
      await unbanUser(initialUser.name);
      toast.success(t("setting.member.unbanned"));
      finishBanChange();
    } catch (error) {
      handleError(error, toast.error, { context: "Unban user" });
    } finally {
      setChangingBan(false);
    }
  };

  const setPartialUser = (state: Partial<User>) => {
    setUser({
      ...user,
      ...state,
    });
  };

  const handleConfirm = async () => {
    if (isCreating && (!user.username || !user.password)) {
      toast.error(t("setting.member.credentials-required"));
      return;
    }

    try {
      requestState.setLoading();
      if (isCreating) {
        await userServiceClient.createUser({ user });
        toast.success(t("setting.member.create-success"));
      } else {
        const updateMask = [];
        if (user.username !== initialUser?.username) {
          updateMask.push("username");
        }
        if (user.password) {
          updateMask.push("password");
        }
        if (user.role !== initialUser?.role) {
          updateMask.push("role");
        }
        const userToUpdate = create(UserSchema, { ...user, name: initialUser?.name ?? user.name });
        await userServiceClient.updateUser({ user: userToUpdate, updateMask: create(FieldMaskSchema, { paths: updateMask }) });
        toast.success(t("setting.member.update-success"));
      }
      requestState.setFinish();
      onSuccess?.();
      onOpenChange(false);
    } catch (error: unknown) {
      handleError(error, toast.error, {
        context: isCreating ? "Create user" : "Update user",
        onError: () => requestState.setError(),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{`${isCreating ? t("common.create") : t("common.edit")} ${t("common.user")}`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="username">{t("common.username")}</Label>
            <Input
              id="username"
              type="text"
              placeholder={t("common.username")}
              value={user.username}
              onChange={(e) =>
                setPartialUser({
                  username: e.target.value,
                })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">{t("common.password")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("common.password")}
              autoComplete="off"
              value={user.password}
              onChange={(e) =>
                setPartialUser({
                  password: e.target.value,
                })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("common.role")}</Label>
            <RadioGroup
              value={String(user.role)}
              onValueChange={(value) => setPartialUser({ role: Number(value) as User_Role })}
              className="flex flex-row gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value={String(User_Role.USER)} id="user" />
                <Label htmlFor="user">{t("setting.member.user")}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value={String(User_Role.ADMIN)} id="admin" />
                <Label htmlFor="admin">{t("setting.member.admin")}</Label>
              </div>
            </RadioGroup>
          </div>
          {!isCreating ? (
            <div className="grid gap-2 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>{t("setting.member.account-ban")}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {initialUser.state === State.ARCHIVED
                      ? banInfo?.permanent
                        ? t("setting.member.current-permanent-ban")
                        : banInfo?.active && banInfo.expiresTime > 0
                          ? t("setting.member.banned-until", { date: new Date(banInfo.expiresTime * 1000).toLocaleString() })
                          : t("setting.member.account-disabled")
                      : t("setting.member.ban-description")}
                  </p>
                </div>
                {initialUser.state === State.ARCHIVED ? (
                  <Button type="button" variant="outline" disabled={changingBan} onClick={() => void handleUnban()}>
                    {t("setting.member.unban")}
                  </Button>
                ) : null}
              </div>
              {initialUser.state !== State.ARCHIVED ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={36500}
                    step={1}
                    value={banDays}
                    placeholder={t("setting.member.ban-days-placeholder")}
                    onChange={(event) => setBanDays(event.target.value)}
                  />
                  <Button type="button" variant="destructive" disabled={changingBan} onClick={() => void handleBan()}>
                    {t("setting.member.ban")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={requestState.isLoading} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={requestState.isLoading} onClick={handleConfirm}>
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateUserDialog;
