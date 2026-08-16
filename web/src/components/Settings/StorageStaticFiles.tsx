import { FolderIcon, LoaderCircleIcon, PaperclipIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { getAccessToken } from "@/auth-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import SettingRow from "./SettingRow";

interface StorageFileInfo {
  path: string;
  sizeBytes: number;
  modTime: string;
  url: string;
}

const authHeaders = (): HeadersInit => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const StorageStaticFiles = () => {
  const t = useTranslate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [directory, setDirectory] = useState("");
  const [selectedFile, setSelectedFile] = useState<File>();
  const [files, setFiles] = useState<StorageFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/admin/storage-files", {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { files?: StorageFileInfo[] };
      setFiles(data.files ?? []);
    } catch (error) {
      console.error(error);
      toast.error(t("setting.storage.static-files-load-failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error(t("setting.storage.static-files-select-file"));
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("path", directory.trim());
      form.set("file", selectedFile);
      const response = await fetch("/api/v1/admin/storage-files", {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: form,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const uploaded = (await response.json()) as StorageFileInfo;
      toast.success(t("setting.storage.static-files-uploaded", { path: uploaded.path }));
      setSelectedFile(undefined);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await loadFiles();
    } catch (error) {
      console.error(error);
      toast.error(t("setting.storage.static-files-upload-failed"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (path: string) => {
    try {
      const response = await fetch(`/api/v1/admin/storage-files?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      toast.success(t("setting.storage.static-files-deleted"));
      await loadFiles();
    } catch (error) {
      console.error(error);
      toast.error(t("setting.storage.static-files-delete-failed"));
    }
  };

  const previewURL = selectedFile
    ? `/storage/${[directory.trim().replace(/^\/+|\/+$/g, ""), selectedFile.name].filter(Boolean).join("/")}`
    : undefined;

  return (
    <div className="space-y-4">
      <SettingRow label={t("setting.storage.static-files-path")} description={t("setting.storage.static-files-path-description")}>
        <div className="flex w-full max-w-lg overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring/50">
          <span className="flex shrink-0 items-center bg-muted px-2 text-sm text-muted-foreground">/storage/</span>
          <Input
            className="rounded-none border-0 font-mono shadow-none focus-visible:ring-0"
            value={directory}
            placeholder="5/path1"
            onChange={(event) => setDirectory(event.target.value.replace(/\\/g, "/"))}
          />
        </div>
      </SettingRow>

      <SettingRow label={t("setting.storage.static-files-file")} description={previewURL}>
        <div className="flex w-full max-w-lg items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => setSelectedFile(event.target.files?.[0])}
          />
          <Button type="button" variant="outline" className="min-w-0 flex-1 justify-start" onClick={() => fileInputRef.current?.click()}>
            <PaperclipIcon className="size-4 shrink-0" />
            <span className="truncate">{selectedFile?.name || t("setting.storage.static-files-choose")}</span>
          </Button>
          <Button type="button" className="shrink-0" disabled={!selectedFile || uploading} onClick={() => void handleUpload()}>
            {uploading ? <LoaderCircleIcon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
            {t("setting.storage.static-files-upload")}
          </Button>
        </div>
      </SettingRow>

      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">
          <FolderIcon className="size-3.5" />
          <span>{t("setting.storage.static-files-list")}</span>
          <span className="text-foreground">{files.length}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" />
            {t("setting.storage.static-files-loading")}
          </div>
        ) : files.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("setting.storage.static-files-empty")}</p>
        ) : (
          <ul className="divide-y">
            {files.map((file) => (
              <li key={file.path} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn("block truncate font-mono text-sm text-primary hover:underline")}
                  >
                    {file.url}
                  </a>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {file.path} · {formatBytes(file.sizeBytes)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  aria-label={t("common.delete")}
                  onClick={() => void handleDelete(file.path)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default StorageStaticFiles;
