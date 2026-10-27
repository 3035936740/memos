import {
  MusicIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  RepeatIcon,
  RotateCcwIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import MusicVisualizer from "@/components/MusicVisualizer";
import MusicVolumeSlider from "@/components/MusicVolumeSlider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import type { InstanceMusicMode } from "@/lib/instance-content";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

/** Cells in the text progress bar the developer style shows instead of the drawn one. */
const TEXT_BAR_CELLS = 18;

const CONTROL_CLASSES =
  "flex size-8 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const MAIN_CONTROL_CLASSES = "size-10 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground";

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const textBar = (ratio: number) => {
  const filled = Math.round(ratio * TEXT_BAR_CELLS);
  return `[${"=".repeat(Math.max(0, filled - 1))}${filled > 0 ? ">" : ""}${" ".repeat(TEXT_BAR_CELLS - filled)}]`;
};

const MODE_ORDER: InstanceMusicMode[] = ["random", "sequential", "reverse"];
const MODE_ICONS = { random: ShuffleIcon, sequential: RepeatIcon, reverse: RotateCcwIcon };

/** The top-bar player for the playlist the admin sets up in System settings; every order loops. */
const ToolbarMusicPlayer = () => {
  const t = useTranslate();
  const player = useMusicPlayer();

  if (!player.available) return null;

  const { tracks, current, index, playing, volume, mode, currentTime, duration } = player;
  const muted = player.muted || volume === 0;
  const ModeIcon = MODE_ICONS[mode];
  const modeLabel = t(`music-admin.mode-${mode}`);
  const nextMode = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
  const ratio = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const handleSeek = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    player.seek((event.clientX - rect.left) / rect.width);
  };

  const handleSeekKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") player.seek(ratio + 0.05);
    if (event.key === "ArrowLeft") player.seek(ratio - 0.05);
  };

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("blog-extra.music")}
        title={current?.title ?? t("blog-extra.music")}
        data-music-trigger=""
        data-playing={playing || undefined}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-accent/65 data-popup-open:text-foreground"
      >
        {playing && muted ? (
          <VolumeXIcon className="size-4" />
        ) : playing ? (
          <MusicVisualizer variant="compact" />
        ) : (
          <MusicIcon className="size-4" />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-72 p-3">
        <div data-music-player="" className="flex flex-col gap-3">
          <div data-music-lcd="" className="rounded-md bg-muted/60 px-3 py-2">
            <MusicVisualizer variant="large" className="mb-2" />
            <p data-music-title="" className="truncate text-sm font-medium text-foreground">
              {current?.title}
            </p>
            {current?.artist && <p className="truncate text-xs text-muted-foreground">{current.artist}</p>}
            <p className="mt-0.5 flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>
                {index + 1} / {tracks.length}
              </span>
              <span>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </p>
            <p data-music-progress-text="" aria-hidden className="hidden whitespace-pre font-mono text-[11px]">
              {textBar(ratio)}
            </p>
          </div>

          <div
            role="slider"
            tabIndex={0}
            aria-label={t("blog-extra.music-progress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            data-music-progress=""
            onClick={handleSeek}
            onKeyDown={handleSeekKey}
            className="relative h-1.5 cursor-pointer overflow-hidden rounded-full bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <div
              data-music-progress-fill=""
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              data-music-button=""
              aria-label={`${t("music-admin.mode")}: ${modeLabel}`}
              title={modeLabel}
              onClick={() => player.setMode(nextMode)}
              className={CONTROL_CLASSES}
            >
              <ModeIcon className="size-4" />
            </button>
            <button
              type="button"
              data-music-button=""
              aria-label={t("blog-extra.music-previous")}
              onClick={player.previous}
              className={CONTROL_CLASSES}
            >
              <SkipBackIcon className="size-4" />
            </button>
            <button
              type="button"
              data-music-button=""
              data-music-main=""
              aria-label={playing ? t("blog-extra.music-pause") : t("blog-extra.music-play")}
              onClick={player.toggle}
              className={cn(CONTROL_CLASSES, MAIN_CONTROL_CLASSES)}
            >
              {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
            </button>
            <button
              type="button"
              data-music-button=""
              aria-label={t("blog-extra.music-next")}
              onClick={player.next}
              className={CONTROL_CLASSES}
            >
              <SkipForwardIcon className="size-4" />
            </button>
            <button
              type="button"
              data-music-button=""
              aria-label={muted ? t("blog-extra.music-unmute") : t("blog-extra.music-mute")}
              title={muted ? t("blog-extra.music-unmute") : t("blog-extra.music-mute")}
              onClick={player.toggleMute}
              className={CONTROL_CLASSES}
            >
              {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {muted ? (
              <VolumeXIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Volume2Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <MusicVolumeSlider value={volume} onChange={player.setVolume} label={t("blog-extra.music-volume")} className="flex-1" />
          </div>

          <ol data-music-list="" className="-mx-1 max-h-40 overflow-y-auto">
            {tracks.map((track, trackIndex) => (
              <li key={track.id}>
                <button
                  type="button"
                  data-music-track=""
                  aria-current={trackIndex === index ? "true" : undefined}
                  onClick={() => player.playAt(trackIndex)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent",
                    trackIndex === index ? "font-medium text-primary" : "text-foreground/85",
                  )}
                >
                  <span className="w-5 shrink-0 text-[11px] tabular-nums text-muted-foreground">{trackIndex + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{track.title}</span>
                </button>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={player.turnOff}
            className="flex items-center justify-center gap-1.5 rounded-md py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <PowerIcon className="size-3.5" />
            {t("blog-extra.music-off")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ToolbarMusicPlayer;
