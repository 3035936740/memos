import { FileUpIcon, LinkIcon, SaveIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type BlockedWordsSetting,
  clearBlockedWords,
  getBlockedWordsSetting,
  importBlockedWordsFromURL,
  replaceBlockedWords,
} from "@/utils/content-moderation";
import { useTranslate } from "@/utils/i18n";
import { SettingList, SettingListItem, SettingPanel } from "./SettingList";

const MAX_FILE_BYTES = 30 * 1024 * 1024;

const BlockedWordsEditor = () => {
  const t = useTranslate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [setting, setSetting] = useState<BlockedWordsSetting>();
  const [wordsText, setWordsText] = useState("");
  const [savedWordsText, setSavedWordsText] = useState("");
  const [sourceURL, setSourceURL] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"manual" | "file" | "url" | "clear">();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const sourceDescription = (currentSetting: BlockedWordsSetting | undefined) => {
    if (!currentSetting || currentSetting.count === 0) return t("setting.blocked-words.disabled");
    const updatedAt = currentSetting.updatedAt ? new Date(currentSetting.updatedAt).toLocaleString() : t("common.unknown-time");
    if (currentSetting.sourceType === "url") {
      return t("setting.blocked-words.latest-source", {
        source: currentSetting.sourceUrl || t("setting.blocked-words.url-import"),
        updatedAt,
      });
    }
    if (currentSetting.sourceType === "file") {
      return t("setting.blocked-words.latest-source", {
        source: currentSetting.sourceName || t("setting.blocked-words.file-upload"),
        updatedAt,
      });
    }
    return t("setting.blocked-words.latest-source", { source: t("setting.blocked-words.manual-entry"), updatedAt });
  };

  const applySetting = (nextSetting: BlockedWordsSetting) => {
    setSetting(nextSetting);
    // Do not expose the actual words to the frontend. If a word list exists,
    // hide the manual editor. Keep wordsText empty.
    setWordsText("");
    setSavedWordsText("");
  };

  useEffect(() => {
    let active = true;
    getBlockedWordsSetting()
      .then((nextSetting) => {
        if (active) {
          applySetting(nextSetting);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          toast.error(error instanceof Error ? error.message : t("setting.blocked-words.load-failed"));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  const handleManualReplace = async () => {
    if (!wordsText.trim()) {
      toast.error(t("setting.blocked-words.empty-error"));
      return;
    }
    setAction("manual");
    try {
      const nextSetting = await replaceBlockedWords(wordsText, "manual");
      applySetting(nextSetting);
      toast.success(t("setting.blocked-words.replaced", { count: nextSetting.count }));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("setting.blocked-words.save-failed"));
    } finally {
      setAction(undefined);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t("setting.blocked-words.file-too-large"));
      return;
    }

    setAction("file");
    try {
      const content = await file.text();
      const nextSetting = await replaceBlockedWords(content, "file", file.name);
      applySetting(nextSetting);
      toast.success(t("setting.blocked-words.file-replaced", { count: nextSetting.count }));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("setting.blocked-words.file-import-failed"));
    } finally {
      setAction(undefined);
    }
  };

  const handleURLImport = async () => {
    const url = sourceURL.trim();
    if (!url) {
      toast.error(t("setting.blocked-words.url-required"));
      return;
    }
    setAction("url");
    try {
      const nextSetting = await importBlockedWordsFromURL(url);
      applySetting(nextSetting);
      toast.success(t("setting.blocked-words.url-replaced", { count: nextSetting.count }));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("setting.blocked-words.url-import-failed"));
    } finally {
      setAction(undefined);
    }
  };

  const handleClear = async () => {
    setAction("clear");
    try {
      const nextSetting = await clearBlockedWords();
      applySetting(nextSetting);
      setSourceURL("");
      toast.success(t("setting.blocked-words.cleared"));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("setting.blocked-words.clear-failed"));
      throw error;
    } finally {
      setAction(undefined);
    }
  };

  const busy = loading || action !== undefined;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SettingList>
        <SettingListItem
          icon={<ShieldAlertIcon className="size-4" />}
          label={t("setting.blocked-words.current-count", { count: setting?.count ?? 0 })}
          description={t("setting.blocked-words.status-description", { source: sourceDescription(setting) })}
        >
          <Button variant="destructive" size="sm" disabled={busy || (setting?.count ?? 0) === 0} onClick={() => setClearDialogOpen(true)}>
            <Trash2Icon className="size-4" />
            {t("setting.blocked-words.clear")}
          </Button>
        </SettingListItem>
      </SettingList>

      {/* 手动维护词库：仅当当前没有启用的词库（count === 0）时显示输入框 */}
      {(setting?.count ?? 0) === 0 && (
        <SettingPanel
          header={
            <div>
              <div className="text-sm font-medium text-foreground">{t("setting.blocked-words.manual-title")}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("setting.blocked-words.manual-description")}</p>
            </div>
          }
          footer={
            <div className="flex justify-end">
              <Button size="sm" disabled={busy || wordsText === savedWordsText} onClick={handleManualReplace}>
                <SaveIcon className="size-4" />
                {action === "manual" ? t("setting.blocked-words.replacing") : t("setting.blocked-words.save-replace")}
              </Button>
            </div>
          }
        >
          <Textarea
            className="min-h-40 rounded-none border-0 font-mono shadow-none focus-visible:ring-0"
            placeholder={t("setting.blocked-words.words-placeholder")}
            value={wordsText}
            disabled={loading}
            onChange={(event) => setWordsText(event.target.value)}
          />
        </SettingPanel>
      )}

      <SettingList>
        <SettingListItem
          icon={<LinkIcon className="size-4" />}
          label={t("setting.blocked-words.url-title")}
          description={t("setting.blocked-words.url-description")}
          vertical
          controlClassName="w-full"
        >
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Input
              type="url"
              className="min-w-0 flex-1"
              placeholder="https://example.com/blocked-words.txt"
              value={sourceURL}
              disabled={busy}
              onChange={(event) => setSourceURL(event.target.value)}
            />
            <Button variant="outline" disabled={busy || !sourceURL.trim()} onClick={handleURLImport}>
              <LinkIcon className="size-4" />
              {action === "url" ? t("setting.blocked-words.importing") : t("setting.blocked-words.import-replace")}
            </Button>
          </div>
        </SettingListItem>

        <SettingListItem
          icon={<FileUpIcon className="size-4" />}
          label={t("setting.blocked-words.file-title")}
          description={t("setting.blocked-words.file-description")}
        >
          <input ref={fileInputRef} type="file" accept=".txt,.csv,text/plain,text/csv" className="hidden" onChange={handleFileChange} />
          <Button variant="outline" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            <FileUpIcon className="size-4" />
            {action === "file" ? t("setting.blocked-words.importing") : t("setting.blocked-words.choose-file-replace")}
          </Button>
        </SettingListItem>
      </SettingList>

      <ConfirmDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title={t("setting.blocked-words.clear-title")}
        description={t("setting.blocked-words.clear-description")}
        confirmLabel={t("setting.blocked-words.clear-confirm")}
        cancelLabel={t("common.cancel")}
        confirmVariant="destructive"
        onConfirm={handleClear}
      />
    </div>
  );
};

export default BlockedWordsEditor;
