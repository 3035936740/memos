import { create } from "@bufbuild/protobuf";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  DownloadIcon,
  MusicIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import MusicVolumeSlider from "@/components/MusicVolumeSlider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { attachmentServiceClient, memoServiceClient } from "@/connect";
import { type InstanceMusicConfig, type InstanceMusicMode, type InstanceMusicTrack, isPlayableTrack } from "@/lib/instance-content";
import { cn } from "@/lib/utils";
import { AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";
import { State } from "@/types/proto/api/v1/common_pb";
import { getAttachmentType, getAttachmentUrl } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";
import { SettingList, SettingListItem } from "./SettingList";

interface Props {
  value: InstanceMusicConfig;
  onChange: (value: InstanceMusicConfig) => void;
}

/** Memos with these tags can lend their audio attachments to the playlist; visitors may play them like the memo. */
const IMPORT_FILTER = 'tag in ["音乐", "music", "bgm"] && visibility in ["PUBLIC"]';

const newTrackId = () => `track-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const InstanceMusicEditor = ({ value, onChange }: Props) => {
  const t = useTranslate();
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  // One track at a time can be tried out here, so the admin can check a link plays before saving.
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => () => previewRef.current?.pause(), []);
  useEffect(() => {
    if (previewRef.current) previewRef.current.volume = value.defaultVolume;
  }, [value.defaultVolume]);

  const togglePreview = (track: InstanceMusicTrack) => {
    const audio = previewRef.current ?? new Audio();
    previewRef.current = audio;
    audio.volume = value.defaultVolume;
    if (previewId === track.id) {
      audio.pause();
      setPreviewId(null);
      return;
    }
    audio.onended = () => setPreviewId(null);
    audio.src = track.url;
    setPreviewId(track.id);
    audio.play().catch(() => {
      setPreviewId(null);
      toast.error(t("music-admin.preview-failed"));
    });
  };
  const modeOptions: Array<{ value: InstanceMusicMode; label: string }> = [
    { value: "random", label: t("music-admin.mode-random") },
    { value: "sequential", label: t("music-admin.mode-sequential") },
    { value: "reverse", label: t("music-admin.mode-reverse") },
  ];

  const update = (partial: Partial<InstanceMusicConfig>) => onChange({ ...value, ...partial });
  const setTracks = (tracks: InstanceMusicTrack[]) => update({ tracks });
  const updateTrack = (id: string, partial: Partial<InstanceMusicTrack>) =>
    setTracks(value.tracks.map((track) => (track.id === id ? { ...track, ...partial } : track)));
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= value.tracks.length) return;
    const tracks = [...value.tracks];
    [tracks[index], tracks[target]] = [tracks[target], tracks[index]];
    setTracks(tracks);
  };
  const addTrack = () => {
    const id = newTrackId();
    setTracks([...value.tracks, { id, title: t("music-admin.new-track"), artist: "", url: "" }]);
    setOpenId(id);
  };

  // Pull in the audio of public memos tagged #音乐 / #music / #bgm, skipping files already listed.
  const importFromMemos = async () => {
    setImporting(true);
    try {
      const { memos } = await memoServiceClient.listMemos({ state: State.NORMAL, filter: IMPORT_FILTER, pageSize: 100 });
      const known = new Set(value.tracks.map((track) => track.url));
      const imported = memos.flatMap((memo) =>
        memo.attachments
          .filter((attachment) => getAttachmentType(attachment) === "audio/*")
          .map((attachment) => ({
            id: newTrackId(),
            title: attachment.filename.replace(/\.[^.]+$/, "") || attachment.filename,
            artist: "",
            url: getAttachmentUrl(attachment),
          }))
          .filter((track) => !known.has(track.url)),
      );
      setTracks([...value.tracks, ...imported]);
      toast.success(t("music-admin.imported", { n: imported.length }));
    } catch {
      toast.error(t("music-admin.import-failed"));
    } finally {
      setImporting(false);
    }
  };

  const uploadLocalAudio = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: InstanceMusicTrack[] = [];
      for (const file of Array.from(files)) {
        const attachment = await attachmentServiceClient.createAttachment({
          attachment: create(AttachmentSchema, {
            filename: file.name,
            size: BigInt(file.size),
            type: file.type || "audio/mpeg",
            content: new Uint8Array(await file.arrayBuffer()),
          }),
        });
        if (getAttachmentType(attachment) !== "audio/*") throw new Error("Uploaded file is not audio");
        uploaded.push({
          id: newTrackId(),
          title: file.name.replace(/\.[^.]+$/, "") || file.name,
          artist: "",
          url: getAttachmentUrl(attachment),
        });
      }
      const known = new Set(value.tracks.map((track) => track.url));
      setTracks([...value.tracks, ...uploaded.filter((track) => !known.has(track.url))]);
      toast.success(t("music-admin.uploaded", { n: uploaded.length }));
    } catch {
      toast.error(t("music-admin.upload-failed"));
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <SettingList>
        <SettingListItem label={t("music-admin.enabled")} description={t("music-admin.enabled-description")}>
          <Switch checked={value.enabled} onCheckedChange={(enabled) => update({ enabled })} />
        </SettingListItem>
        <SettingListItem label={t("music-admin.autoplay")} description={t("music-admin.autoplay-description")}>
          <Switch checked={value.autoplay} onCheckedChange={(autoplay) => update({ autoplay })} />
        </SettingListItem>
        <SettingListItem label={t("music-admin.default-muted")} description={t("music-admin.default-muted-description")}>
          <Switch checked={value.defaultMuted} onCheckedChange={(defaultMuted) => update({ defaultMuted })} />
        </SettingListItem>
        <SettingListItem label={t("music-admin.default-volume")} description={t("music-admin.default-volume-description")}>
          <MusicVolumeSlider
            value={value.defaultVolume}
            onChange={(defaultVolume) => update({ defaultVolume })}
            label={t("music-admin.default-volume")}
            className="w-52 max-w-full"
          />
        </SettingListItem>
        <SettingListItem label={t("music-admin.mode")} description={t("music-admin.mode-description")}>
          <Select value={value.mode} items={modeOptions} onValueChange={(mode) => update({ mode: mode as InstanceMusicMode })}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingListItem>
      </SettingList>

      {value.enabled && !value.tracks.some(isPlayableTrack) && (
        <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-muted-foreground">
          {t("music-admin.no-playable")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("music-admin.tracks-description")}</p>
        <div className="flex gap-2">
          <input
            ref={uploadInputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav,.flac,.opus,.webm"
            multiple
            className="hidden"
            onChange={(event) => void uploadLocalAudio(event.target.files)}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => uploadInputRef.current?.click()}>
            <UploadIcon className="size-4" />
            {t("music-admin.upload")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={importing} onClick={() => void importFromMemos()}>
            <DownloadIcon className="size-4" />
            {t("music-admin.import")}
          </Button>
          <Button type="button" size="sm" onClick={addTrack}>
            <PlusIcon className="size-4" />
            {t("music-admin.add")}
          </Button>
        </div>
      </div>

      {value.tracks.length === 0 && (
        <div data-settings-surface="" className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t("music-admin.empty")}
        </div>
      )}

      <div className="space-y-2">
        {value.tracks.map((track, index) => {
          const open = openId === track.id;
          return (
            <section
              data-settings-surface=""
              key={track.id}
              className={cn("rounded-lg border bg-card/50", open ? "space-y-4 p-4" : "px-3 py-1.5")}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : track.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <ChevronRightIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                  <MusicIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-sm font-medium">{track.title || t("music-admin.untitled")}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{track.artist || track.url}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!track.url}
                  onClick={() => togglePreview(track)}
                  aria-label={t("music-admin.preview")}
                  title={t("music-admin.preview")}
                >
                  {previewId === track.id ? <SquareIcon className="size-4" /> : <PlayIcon className="size-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={t("common.move-up")}
                >
                  <ArrowUpIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === value.tracks.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={t("common.move-down")}
                >
                  <ArrowDownIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setTracks(value.tracks.filter((item) => item.id !== track.id))}
                  aria-label={t("common.delete")}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>

              {open && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t("music-admin.title")}</Label>
                    <Input value={track.title} onChange={(event) => updateTrack(track.id, { title: event.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("music-admin.artist")}</Label>
                    <Input value={track.artist ?? ""} onChange={(event) => updateTrack(track.id, { artist: event.target.value })} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t("music-admin.url")}</Label>
                    <Input
                      type="url"
                      value={track.url}
                      placeholder="https://example.com/song.mp3"
                      onChange={(event) => updateTrack(track.id, { url: event.target.value.trim() })}
                    />
                    <p className="text-xs text-muted-foreground">{t("music-admin.url-description")}</p>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default InstanceMusicEditor;
