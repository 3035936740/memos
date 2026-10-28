import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { getAccessToken } from "@/auth-state";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useInstance } from "@/contexts/InstanceContext";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem } from "./SettingList";

const BackupExport = () => {
  const t = useTranslate();
  const { profile } = useInstance();
  const [attachments, setAttachments] = useState("local");
  const attachmentOptions = (["local", "all", "none"] as const).map((value) => ({ value, label: t(`backup.${value}`) }));
  const [database, setDatabase] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => active.current?.abort(), []);
  const download = async () => {
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    let writable: WritableStream<Uint8Array> | undefined;
    try {
      const picker = (
        window as Window & {
          showSaveFilePicker?: (options: {
            suggestedName: string;
          }) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>;
        }
      ).showSaveFilePicker;
      if (picker)
        writable = await (
          await picker.call(window, { suggestedName: `memos-backup-${new Date().toISOString().slice(0, 10)}.zip` })
        ).createWritable();
      const token = getAccessToken();
      const response = await fetch(`/api/v1/admin/backup?attachments=${attachments}&database=${database ? "1" : "0"}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(response.status === 409 ? t("backup.running") : `${t("backup.failed")} (HTTP ${response.status})`);
      if (writable && response.body) await response.body.pipeTo(writable, { signal: controller.signal });
      else {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `memos-backup-${new Date().toISOString().slice(0, 10)}.zip`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      if (writable)
        try {
          await writable.abort(error);
        } catch {
          /* Already closed by pipeTo. */
        }
      if (!(error instanceof DOMException && error.name === "AbortError"))
        toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      active.current = undefined;
    }
  };
  return (
    <SettingGroup title={t("backup.title")} description={t("backup.description")} showSeparator>
      <SettingList>
        <SettingListItem label={t("backup.attachments")}>
          <Select value={attachments} items={attachmentOptions} disabled={busy} onValueChange={(value) => value && setAttachments(value)}>
            <SelectTrigger aria-label={t("backup.attachments")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {attachmentOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingListItem>
        <SettingListItem label={t("backup.database")} description={t("backup.sensitive")}>
          <Switch checked={database} disabled={busy} onCheckedChange={setDatabase} aria-label={t("backup.database")} />
        </SettingListItem>
      </SettingList>
      <Button disabled={busy || profile.demo} onClick={() => void download()}>
        {busy ? t("backup.downloading") : t("backup.download")}
      </Button>
      {busy && (
        <Button variant="ghost" onClick={() => active.current?.abort()}>
          {t("common.cancel")}
        </Button>
      )}
    </SettingGroup>
  );
};
export default BackupExport;
