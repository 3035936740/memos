import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (volume: number) => void;
  label: string;
  className?: string;
}

/** Shared, theme-colored volume slider for the player and the administrator's defaults. */
const MusicVolumeSlider = ({ value, onChange, label, className }: Props) => {
  const percent = Math.round(value * 100);
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <input
        data-music-volume=""
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        aria-label={label}
        aria-valuetext={`${percent}%`}
        className="h-6 min-w-0 flex-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        style={{ "--music-volume": `${percent}%` } as CSSProperties}
      />
      <span className="w-9 shrink-0 text-end text-xs tabular-nums text-muted-foreground">{percent}%</span>
    </div>
  );
};

export default MusicVolumeSlider;
