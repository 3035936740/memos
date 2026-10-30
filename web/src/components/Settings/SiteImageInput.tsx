import { LoaderCircleIcon, UploadIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import { getAccessToken } from "@/auth-state";
import BrandImage from "@/components/BrandImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { handleError } from "@/lib/error";
import { useTranslate } from "@/utils/i18n";

type ImageKind = "avatar" | "background" | "logo";

interface Props {
  kind: ImageKind;
  value: string;
  disabled?: boolean;
  onChange: (url: string) => void;
  onUploadingChange: (uploading: boolean) => void;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Shared by the avatar/background editor and the server-branding dialog. */
export const SiteImageField = ({ kind, value, disabled, onChange, onUploadingChange }: Props) => {
  const t = useTranslate();
  const id = useId();
  const directory = { avatar: "avatars/default", background: "backgrounds/default", logo: "branding/logos" }[kind];
  const wasUploaded = value.startsWith(`/storage/${directory}/`);
  const [source, setSource] = useState<"file" | "url">(value && !wasUploaded ? "url" : "file");
  const [url, setUrl] = useState(wasUploaded ? "" : value);
  const [uploadedUrl, setUploadedUrl] = useState(wasUploaded ? value : "");
  const [filename, setFilename] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = source === "file" ? uploadedUrl : url.trim();

  const upload = async (file?: File) => {
    if (!file || disabled || uploading) return;
    const extension =
      file.type === "image/svg+xml" && kind === "logo"
        ? "svg"
        : file.type
          ? IMAGE_EXTENSIONS[file.type]
          : (kind === "logo" ? /\.(png|jpe?g|gif|webp|svg)$/i : /\.(png|jpe?g|gif|webp)$/i).exec(file.name)?.[1].toLowerCase();
    if (!extension || file.size > 10 * 1024 * 1024 || file.size === 0) {
      toast.error(t(kind === "logo" ? "setting.system.logo-invalid-file" : "setting.system.default-avatar-invalid-file"));
      return;
    }
    setUploading(true);
    onUploadingChange(true);
    try {
      // Public admin storage is readable by visitors and installed web apps.
      // Unique names avoid overwrites and let browsers detect a changed app icon.
      const form = new FormData();
      form.set("path", directory);
      form.set("file", file, `${uuidv4()}.${extension}`);
      const token = getAccessToken();
      const response = await fetch("/api/v1/admin/storage-files", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!response.ok) throw new Error(t("setting.storage.static-files-upload-failed"));
      const result = (await response.json()) as { url?: string };
      if (!result.url?.startsWith("/storage/")) throw new Error(t("setting.storage.static-files-upload-failed"));
      setUploadedUrl(result.url);
      setFilename(file.name);
      onChange(result.url);
      toast.success(t("setting.system.default-avatar-uploaded"));
    } catch (error) {
      handleError(error, toast.error, { fallbackMessage: t("setting.storage.static-files-upload-failed") });
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-source`}>{t("setting.system.default-avatar-source")}</Label>
        <Select
          value={source}
          disabled={disabled || uploading}
          onValueChange={(next) => {
            setSource(next as "file" | "url");
            if (next === "url" || uploadedUrl) onChange(next === "file" ? uploadedUrl : url.trim());
          }}
        >
          <SelectTrigger id={`${id}-source`} className="w-full">
            <SelectValue>{t(source === "file" ? "setting.system.default-avatar-file" : "setting.system.default-avatar-url")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="file">{t("setting.system.default-avatar-file")}</SelectItem>
            <SelectItem value="url">{t("setting.system.default-avatar-url")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {preview && (
        <div className="flex min-w-0 flex-col items-center justify-center gap-2 text-center">
          <BrandImage
            src={preview}
            className={kind === "background" ? "h-32 w-full max-w-xs object-contain" : "size-16 shrink-0 object-contain"}
          />
          {source === "file" && filename && <span className="max-w-full break-all text-sm text-muted-foreground">{filename}</span>}
        </div>
      )}
      {source === "url" ? (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-url`}>{t("setting.system.default-avatar-url")}</Label>
          <Input
            id={`${id}-url`}
            placeholder={`https://example.com/${kind === "background" ? "background.webp" : kind === "logo" ? "logo.svg" : "avatar.png"}`}
            disabled={disabled || uploading}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              onChange(event.target.value.trim());
            }}
          />
        </div>
      ) : (
        <Button type="button" variant="outline" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <LoaderCircleIcon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
          {t("setting.system.default-avatar-upload")}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={`image/png,image/jpeg,image/gif,image/webp${kind === "logo" ? ",image/svg+xml" : ""}`}
        className="hidden"
        disabled={disabled || uploading}
        aria-label={t("setting.system.default-avatar-upload")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void upload(file);
        }}
      />
    </div>
  );
};

const SiteImageInput = ({ kind, value, disabled, onChange, onUploadingChange }: Props) => {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [revision, setRevision] = useState(0);
  const [uploading, setUploading] = useState(false);
  const title = t(kind === "avatar" ? "setting.system.default-avatar" : "setting.system.default-background-image");
  const description = t(
    kind === "avatar" ? "setting.system.default-avatar-description" : "setting.system.background-image-upload-description",
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setDraft(value);
          setRevision((current) => current + 1);
          setOpen(true);
        }}
      >
        {t("common.edit")}
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !uploading && setOpen(nextOpen)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <SiteImageField
            key={revision}
            kind={kind}
            value={draft}
            disabled={disabled}
            onChange={setDraft}
            onUploadingChange={(busy) => {
              setUploading(busy);
              onUploadingChange(busy);
            }}
          />
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => {
                setDraft("");
                setRevision((current) => current + 1);
              }}
            >
              {t("setting.system.image-restore-default")}
            </Button>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={uploading} onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={uploading}
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                {t("common.confirm")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SiteImageInput;
