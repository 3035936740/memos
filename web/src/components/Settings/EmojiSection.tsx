import { useQueryClient } from "@tanstack/react-query";
import { ImagePlusIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createEmoji, createEmojiGroup, deleteEmoji, deleteEmojiGroup, type EmojiGroup, useEmojiPacks } from "@/utils/emoji";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import SettingSection from "./SettingSection";

const EmojiGroupEditor = ({ group }: { group: EmojiGroup }) => {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [url, setURL] = useState("");
  const [file, setFile] = useState<File>();
  const [source, setSource] = useState<"file" | "url">("file");
  const [saving, setSaving] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["emoji-packs"] });
  const handleCreate = async () => {
    if (!name.trim() || (source === "file" ? !file : !url.trim())) return;
    setSaving(true);
    try {
      await createEmoji({
        groupId: group.id,
        name: name.trim(),
        file: source === "file" ? file : undefined,
        url: source === "url" ? url.trim() : undefined,
      });
      setName("");
      setURL("");
      setFile(undefined);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
      toast.success(t("emoji.admin.created"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("emoji.admin.save-failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{group.name}</h3>
          <p className="text-xs text-muted-foreground">{t("emoji.admin.emoji-count", { count: group.emojis.length })}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("emoji.admin.delete-group")}
          onClick={async () => {
            try {
              await deleteEmojiGroup(group.id);
              await refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("emoji.admin.delete-failed"));
            }
          }}
        >
          <Trash2Icon className="size-4 text-destructive" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-5 md:grid-cols-6">
        {group.emojis.map((emoji) => (
          <div key={emoji.id} className="group relative flex min-w-0 flex-col items-center rounded-md border border-border p-2">
            <img src={emoji.url} alt={emoji.name} loading="lazy" className="size-16 object-contain" />
            <span className="mt-1 w-full truncate text-center text-xs">{emoji.name}</span>
            <Badge variant="outline" className="mt-1 max-w-full truncate px-1 py-0 text-[9px] font-normal">
              {emoji.storageType}
            </Badge>
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 size-6 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              aria-label={t("emoji.admin.delete-emoji")}
              onClick={async () => {
                try {
                  await deleteEmoji(emoji.id);
                  await refresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t("emoji.admin.delete-failed"));
                }
              }}
            >
              <Trash2Icon className="size-3" />
            </Button>
          </div>
        ))}
        {group.emojis.length === 0 && (
          <p className="col-span-full py-4 text-center text-sm text-muted-foreground">{t("emoji.admin.no-emojis")}</p>
        )}
      </div>

      <div className="space-y-3 border-t border-border bg-muted/20 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("emoji.admin.emoji-name")} maxLength={40} />
          <Tabs value={source} onValueChange={(value) => setSource(value as "file" | "url")}>
            <TabsList className="rounded-md bg-muted p-1">
              <TabsTrigger value="file">{t("emoji.admin.upload-file")}</TabsTrigger>
              <TabsTrigger value="url">URL</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {source === "file" ? (
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm hover:bg-accent">
            <UploadIcon className="size-4" />
            <span className="min-w-0 flex-1 truncate">{file?.name ?? t("emoji.admin.choose-image")}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0])}
            />
          </label>
        ) : (
          <Input value={url} onChange={(event) => setURL(event.target.value)} placeholder="https://example.com/emoji.gif" />
        )}
        <div className="flex justify-end">
          <Button onClick={handleCreate} disabled={saving || !name.trim() || (source === "file" ? !file : !url.trim())}>
            <ImagePlusIcon className="size-4" />
            {t("emoji.admin.add-emoji")}
          </Button>
        </div>
      </div>
    </div>
  );
};

const EmojiSection = () => {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const { data: groups = [], isLoading } = useEmojiPacks();
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <SettingSection title={t("emoji.admin.title")}>
      <SettingGroup title={t("emoji.admin.groups")} description={t("emoji.admin.description")}>
        <div className="flex gap-2">
          <Input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder={t("emoji.admin.group-name")}
            maxLength={40}
          />
          <Button
            disabled={saving || !groupName.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await createEmojiGroup(groupName.trim());
                setGroupName("");
                await queryClient.invalidateQueries({ queryKey: ["emoji-packs"] });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t("emoji.admin.save-failed"));
              } finally {
                setSaving(false);
              }
            }}
          >
            <PlusIcon className="size-4" />
            {t("emoji.admin.add-group")}
          </Button>
        </div>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <EmojiGroupEditor key={group.id} group={group} />
            ))}
            {groups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("emoji.admin.no-groups")}</p>}
          </div>
        )}
      </SettingGroup>
    </SettingSection>
  );
};

export default EmojiSection;
