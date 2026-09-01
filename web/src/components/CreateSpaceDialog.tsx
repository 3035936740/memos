import { Code, ConnectError } from "@connectrpc/connect";
import { CameraIcon, ChevronDownIcon } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import SpaceMark from "@/components/SpaceMark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useCreateSpace } from "@/hooks/useSpaceQueries";
import { convertFileToBase64 } from "@/lib/browser";
import { handleError } from "@/lib/error";
import { cn } from "@/lib/utils";
import { type Space, Space_AccessMode } from "@/types/proto/api/v1/space_service_pb";
import { useTranslate } from "@/utils/i18n";

const SPACE_UID_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,34}[a-zA-Z0-9])?$/;
const SPACE_URL_SLUG_PATTERN = /^[a-z0-9]{0,64}$/;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (space: Space) => void;
  note?: string;
}

function CreateSpaceDialog({ open, onOpenChange, onCreated, note }: Props) {
  const t = useTranslate();
  const currentUserName = useCurrentUser()?.name ?? "";
  const createSpace = useCreateSpace(currentUserName);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [accessMode, setAccessMode] = useState(Space_AccessMode.INVITE_ONLY);
  const [syncToMainFeed, setSyncToMainFeed] = useState(true);
  const [urlSlug, setUrlSlug] = useState("");
  const [urlSlugConflict, setUrlSlugConflict] = useState(false);
  const [spaceUid, setSpaceUid] = useState(() => uuidv4());
  const [showCustomId, setShowCustomId] = useState(false);
  const [spaceUidConflict, setSpaceUidConflict] = useState(false);
  const isSpaceUidValid = SPACE_UID_PATTERN.test(spaceUid);
  const hasSpaceUidError = !isSpaceUidValid || spaceUidConflict;
  const isURLSlugValid = SPACE_URL_SLUG_PATTERN.test(urlSlug);
  const hasURLSlugError = !isURLSlugValid || urlSlugConflict;

  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setAvatarUrl("");
      setAccessMode(Space_AccessMode.INVITE_ONLY);
      setSyncToMainFeed(true);
      setUrlSlug("");
      setUrlSlugConflict(false);
      setSpaceUid(uuidv4());
      setShowCustomId(false);
      setSpaceUidConflict(false);
    }
  }, [open]);

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0];
    event.target.value = "";
    if (!image) return;
    if (image.size > 10 * 1024 * 1024) {
      toast.error(t("space.avatar-too-large"));
      return;
    }
    try {
      setAvatarUrl(await convertFileToBase64(image));
    } catch (error) {
      handleError(error, toast.error, { context: "Prepare space avatar" });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || hasSpaceUidError || hasURLSlugError || createSpace.isPending) {
      return;
    }

    let space: Space;
    try {
      setSpaceUidConflict(false);
      setUrlSlugConflict(false);
      space = await createSpace.mutateAsync({
        title: trimmedTitle,
        description: description.trim() || undefined,
        ...(avatarUrl ? { avatarUrl } : {}),
        accessMode,
        syncToMainFeed,
        urlSlug: urlSlug || undefined,
        spaceId: spaceUid,
      });
    } catch (error) {
      if (error instanceof ConnectError && error.code === Code.AlreadyExists) {
        if (urlSlug) {
          setUrlSlugConflict(true);
        } else {
          setSpaceUidConflict(true);
          setShowCustomId(true);
        }
      }
      handleError(error, toast.error, { context: "Create space" });
      return;
    }

    toast.success(t("space.create-success"));
    onOpenChange(false);
    onCreated?.(space);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && createSpace.isPending) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("space.create")}</DialogTitle>
            <DialogDescription>{t("space.create-description")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <Label
              title={t("space.upload-avatar")}
              className="group/avatar relative block cursor-pointer overflow-hidden rounded-lg focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            >
              <SpaceMark size="xl" avatarUrl={avatarUrl} />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover/avatar:bg-black/45 group-hover/avatar:opacity-100">
                <CameraIcon className="size-4" />
              </span>
              <input
                type="file"
                aria-label={t("space.upload-avatar")}
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="sr-only"
                onChange={(event) => void handleAvatarChange(event)}
              />
            </Label>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("space.avatar")}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("space.avatar-help")}</p>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="space-title">{t("common.name")}</Label>
            <Input
              id="space-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("space.name-placeholder")}
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="space-description">{t("common.description")}</Label>
            <Textarea
              id="space-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("space.description-placeholder")}
              className="min-h-20 resize-none"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="space-url-slug">{t("space.url-slug")}</Label>
            <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/50">
              <span className="shrink-0 pl-3 font-mono text-xs text-muted-foreground">/space/</span>
              <Input
                id="space-url-slug"
                value={urlSlug}
                onChange={(event) => {
                  setUrlSlug(event.target.value.toLowerCase());
                  setUrlSlugConflict(false);
                }}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={hasURLSlugError}
                className="border-0 pl-0 font-mono text-xs shadow-none focus-visible:ring-0"
                placeholder={t("space.url-slug-placeholder")}
              />
            </div>
            <p
              role={hasURLSlugError ? "alert" : undefined}
              className={cn("text-xs leading-5", hasURLSlugError ? "text-destructive" : "text-muted-foreground")}
            >
              {t(!isURLSlugValid ? "space.url-slug-invalid" : urlSlugConflict ? "space.url-slug-conflict" : "space.url-slug-help")}
            </p>
          </div>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mx-2 px-2 text-muted-foreground"
              aria-expanded={showCustomId}
              aria-controls="space-custom-uid"
              onClick={() => setShowCustomId((visible) => (hasSpaceUidError ? true : !visible))}
            >
              <ChevronDownIcon className={cn("transition-transform", showCustomId && "rotate-180")} />
              {t("space.custom-id-toggle")}
            </Button>
            {showCustomId && (
              <div id="space-custom-uid" className="mt-2 grid gap-2 rounded-md border bg-muted/30 p-3">
                <Label htmlFor="space-uid">{t("space.custom-id-label")}</Label>
                <Input
                  id="space-uid"
                  value={spaceUid}
                  onChange={(event) => {
                    setSpaceUid(event.target.value);
                    setSpaceUidConflict(false);
                  }}
                  maxLength={36}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={hasSpaceUidError}
                  aria-describedby="space-uid-help"
                  className="font-mono text-xs aria-invalid:border-destructive"
                />
                <p
                  id="space-uid-help"
                  role={hasSpaceUidError ? "alert" : undefined}
                  className={cn("text-xs leading-5", hasSpaceUidError ? "text-destructive" : "text-muted-foreground")}
                >
                  {t(!isSpaceUidValid ? "space.custom-id-invalid" : spaceUidConflict ? "space.custom-id-conflict" : "space.custom-id-help")}
                </p>
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="space-access-mode">{t("space.access-mode")}</Label>
            <Select value={String(accessMode)} onValueChange={(value) => setAccessMode(Number(value) as Space_AccessMode)}>
              <SelectTrigger id="space-access-mode">
                <SelectValue>
                  {t(
                    accessMode === Space_AccessMode.PUBLIC
                      ? "space.access-mode-public"
                      : accessMode === Space_AccessMode.AUTHENTICATED
                        ? "space.access-mode-authenticated"
                        : "space.access-mode-invite-only",
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={String(Space_AccessMode.INVITE_ONLY)}>{t("space.access-mode-invite-only")}</SelectItem>
                <SelectItem value={String(Space_AccessMode.PUBLIC)}>{t("space.access-mode-public")}</SelectItem>
                <SelectItem value={String(Space_AccessMode.AUTHENTICATED)}>{t("space.access-mode-authenticated")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">{t("space.access-mode-help")}</p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-3">
            <div className="min-w-0">
              <Label htmlFor="space-sync-main-feed">{t("space.sync-main-feed")}</Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("space.sync-main-feed-help")}</p>
            </div>
            <Switch id="space-sync-main-feed" checked={syncToMainFeed} onCheckedChange={setSyncToMainFeed} />
          </div>
          <p className="text-xs text-muted-foreground">{note ?? t("space.creator-admin-note")}</p>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={createSpace.isPending} onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!title.trim() || hasSpaceUidError || hasURLSlugError || createSpace.isPending}>
              {t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateSpaceDialog;
