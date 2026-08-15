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
import { SettingList, SettingListItem, SettingPanel } from "./SettingList";

const MAX_FILE_BYTES = 30 * 1024 * 1024;

const sourceDescription = (setting: BlockedWordsSetting | undefined) => {
  if (!setting || setting.count === 0) {
    return "当前未启用屏蔽词审核";
  }
  const updatedAt = setting.updatedAt ? new Date(setting.updatedAt).toLocaleString() : "未知时间";
  if (setting.sourceType === "url") {
    return `最近来源：${setting.sourceUrl || "URL 导入"} · ${updatedAt}`;
  }
  if (setting.sourceType === "file") {
    return `最近来源：${setting.sourceName || "上传文件"} · ${updatedAt}`;
  }
  return `最近来源：手动填写 · ${updatedAt}`;
};

const BlockedWordsEditor = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [setting, setSetting] = useState<BlockedWordsSetting>();
  const [wordsText, setWordsText] = useState("");
  const [savedWordsText, setSavedWordsText] = useState("");
  const [sourceURL, setSourceURL] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"manual" | "file" | "url" | "clear">();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

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
          toast.error(error instanceof Error ? error.message : "无法加载屏蔽词");
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
  }, []);

  const handleManualReplace = async () => {
    if (!wordsText.trim()) {
      toast.error("词库不能为空；如需停用请使用“清空屏蔽词”按钮");
      return;
    }
    setAction("manual");
    try {
      const nextSetting = await replaceBlockedWords(wordsText, "manual");
      applySetting(nextSetting);
      toast.success(`已整体替换，共 ${nextSetting.count} 个屏蔽词`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "保存屏蔽词失败");
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
      toast.error("词库文件不能超过 30 MiB");
      return;
    }

    setAction("file");
    try {
      const content = await file.text();
      const nextSetting = await replaceBlockedWords(content, "file", file.name);
      applySetting(nextSetting);
      toast.success(`文件已导入并整体替换，共 ${nextSetting.count} 个屏蔽词`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "导入词库文件失败");
    } finally {
      setAction(undefined);
    }
  };

  const handleURLImport = async () => {
    const url = sourceURL.trim();
    if (!url) {
      toast.error("请输入词库 URL");
      return;
    }
    setAction("url");
    try {
      const nextSetting = await importBlockedWordsFromURL(url);
      applySetting(nextSetting);
      toast.success(`URL 词库已导入并整体替换，共 ${nextSetting.count} 个屏蔽词`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "从 URL 导入失败");
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
      toast.success("屏蔽词已清空");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "清空屏蔽词失败");
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
          label={`当前词库：${setting?.count ?? 0} 个词`}
          description={`${sourceDescription(setting)}。发布备忘录、编辑内容和发表评论都会由服务端检查。`}
        >
          <Button variant="destructive" size="sm" disabled={busy || (setting?.count ?? 0) === 0} onClick={() => setClearDialogOpen(true)}>
            <Trash2Icon className="size-4" />
            清空屏蔽词
          </Button>
        </SettingListItem>
      </SettingList>

      {/* 手动维护词库：仅当当前没有启用的词库（count === 0）时显示输入框 */}
      {(setting?.count ?? 0) === 0 && (
        <SettingPanel
          header={
            <div>
              <div className="text-sm font-medium text-foreground">手动维护词库</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                每行一个词，也支持逗号、分号或 Tab 分隔。保存会整体替换数据库中的旧词库，不会追加历史数据。
              </p>
            </div>
          }
          footer={
            <div className="flex justify-end">
              <Button size="sm" disabled={busy || wordsText === savedWordsText} onClick={handleManualReplace}>
                <SaveIcon className="size-4" />
                {action === "manual" ? "替换中…" : "保存并整体替换"}
              </Button>
            </div>
          }
        >
          <Textarea
            className="min-h-40 rounded-none border-0 font-mono shadow-none focus-visible:ring-0"
            placeholder={"违规词一\n违规词二\n需要屏蔽的短语"}
            value={wordsText}
            disabled={loading}
            onChange={(event) => setWordsText(event.target.value)}
          />
        </SettingPanel>
      )}

      <SettingList>
        <SettingListItem
          icon={<LinkIcon className="size-4" />}
          label="从 URL 导入"
          description="仅允许公开的 HTTP/HTTPS 文本资源；内网地址会被拒绝，下载上限为 30 MiB。成功后整体替换当前词库。"
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
              {action === "url" ? "导入中…" : "导入并替换"}
            </Button>
          </div>
        </SettingListItem>

        <SettingListItem
          icon={<FileUpIcon className="size-4" />}
          label="上传词库文件"
          description="文件只在浏览器中读取，服务器不会保存原文件；解析后的词条直接整体写入数据库。支持 UTF-8 TXT、CSV，最大 30 MiB。"
        >
          <input ref={fileInputRef} type="file" accept=".txt,.csv,text/plain,text/csv" className="hidden" onChange={handleFileChange} />
          <Button variant="outline" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            <FileUpIcon className="size-4" />
            {action === "file" ? "导入中…" : "选择文件并替换"}
          </Button>
        </SettingListItem>
      </SettingList>

      <ConfirmDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title="清空全部屏蔽词？"
        description="这会删除数据库中的当前词库，之后发布内容将不再进行屏蔽词检查。此操作不会删除任何备忘录或评论。"
        confirmLabel="确认清空"
        cancelLabel="取消"
        confirmVariant="destructive"
        onConfirm={handleClear}
      />
    </div>
  );
};

export default BlockedWordsEditor;
