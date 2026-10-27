import { memo, useEffect, useRef, useState } from "react";
import { useMusicEffects } from "@/contexts/MusicPlayerContext";
import { useView } from "@/contexts/ViewContext";
import { cn } from "@/lib/utils";
import { type BlogStyle, isStyledBlog } from "@/utils/blog-style";

type VisualizerKind = "bars" | "pixel" | "spectrum" | "cassette" | "notes";
type VisualizerVariant = "compact" | "large";

/** Styles that draw the music their own way; every other style, and the other layouts, get plain bars. */
const KIND_BY_STYLE: Partial<Record<BlogStyle, VisualizerKind>> = {
  pixel: "pixel",
  terminal: "spectrum",
  vaporwave: "cassette",
  handdrawn: "notes",
};

/** Bands each look draws, in the top-bar button and in the player panel. The cassette only needs the low end. */
const BAND_COUNT: Record<VisualizerKind, Record<VisualizerVariant, number>> = {
  bars: { compact: 4, large: 24 },
  pixel: { compact: 4, large: 12 },
  spectrum: { compact: 4, large: 24 },
  cassette: { compact: 2, large: 2 },
  notes: { compact: 2, large: 5 },
};

/** Lit cells per pixel bar; each cell is 3px with a 1px gap. */
const PIXEL_STEPS: Record<VisualizerVariant, number> = { compact: 4, large: 6 };
const PIXEL_CELL = 4;
const SPECTRUM_STEPS: Record<VisualizerVariant, number> = { compact: 4, large: 8 };
/** How far a note jumps on a full beat, in px. */
const NOTE_LIFT: Record<VisualizerVariant, number> = { compact: 3, large: 9 };
const REST = 0.06;
/** Bands rise almost at once and fall back at this many full heights a second, like a meter. */
const FALL_PER_SECOND = 1.8;

const CASSETTE_REELS = [
  { cx: 22, cy: 23 },
  { cx: 42, cy: 23 },
];
const TAPE_MIN = 3.4;
const TAPE_SPAN = 2.8;

/** Plausible motion for music that cannot be measured (tracks from other sites): a steady kick under drifting bands. */
const simulateBands = (out: Float32Array, seconds: number) => {
  const kick = (1 - ((seconds / 0.48) % 1)) ** 3;
  const last = Math.max(1, out.length - 1);
  for (let band = 0; band < out.length; band++) {
    const x = band / last;
    const drift = 0.5 + 0.5 * Math.sin(seconds * (2.3 + x * 3.1) + band * 1.7) * Math.sin(seconds * (0.7 + x) + band * 0.9);
    const envelope = 0.3 + 0.7 * Math.sin(Math.PI * x) ** 0.7;
    out[band] = Math.min(1, (0.15 + drift * 0.55 + kick * 0.3) * envelope);
  }
};

/** A fixed, lively shape for visitors who asked for less motion, so playing still looks different from paused. */
const stillLevel = (band: number) => 0.3 + 0.25 * (1 + Math.sin(band * 1.3 + 0.6));

const pixelClip = (level: number, steps: number) => `inset(${(steps - Math.max(1, Math.ceil(level * steps))) * PIXEL_CELL}px 0 0 0)`;

const EighthNote = ({ className }: { className: string }) => (
  <svg viewBox="0 0 12 20" className={className} aria-hidden>
    <ellipse cx="4.4" cy="16.4" rx="3.5" ry="2.5" transform="rotate(-22 4.4 16.4)" fill="currentColor" />
    <path
      d="M7.5 15.2C7.6 11 7.7 6.8 7.9 2.4c.9 2 3.4 3 2.7 6.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const BeamedNotes = ({ className }: { className: string }) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden>
    <ellipse cx="4" cy="16.6" rx="3.4" ry="2.4" transform="rotate(-22 4 16.6)" fill="currentColor" />
    <ellipse cx="14.4" cy="15.2" rx="3.4" ry="2.4" transform="rotate(-22 14.4 15.2)" fill="currentColor" />
    <path
      d="M7.1 15.4C7.2 11.6 7.3 8 7.5 4.2M17.5 14C17.6 10.2 17.7 6.6 17.9 2.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path d="M7.5 4.2C11 3.5 14.4 3.3 17.9 2.8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

interface Props {
  /** "compact" sits in the top-bar button; "large" heads the player panel. */
  variant: VisualizerVariant;
  className?: string;
}

/**
 * The music, drawn in the look of the Blog 2 style: pixel retro gets an LED equalizer, the developer style a block
 * grid spectrum, vaporwave a cassette whose reels spin to the beat and wind tape from one side to the other, and
 * hand-drawn a few notes that hop. Every other style shows bars. It follows the real spectrum when the tracks come
 * from this site, and moves to a made-up beat otherwise.
 */
const MusicVisualizerRenderer = ({ kind, variant, className }: Props & { kind: VisualizerKind }) => {
  const { playing, muted, volume, getSpectrum, getPlaybackProgress } = useMusicEffects();
  const count = BAND_COUNT[kind][variant];
  const steps = (kind === "spectrum" ? SPECTRUM_STEPS : PIXEL_STEPS)[variant];
  const [still] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const audible = playing && !muted && volume > 0;
  const active = audible && !still;
  const nodesRef = useRef<Array<HTMLElement | SVGGElement | null>>([]);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    const target = new Float32Array(count);
    const shown = new Float32Array(count).fill(REST);
    let angle = 0;
    let last = performance.now();
    let frame = 0;
    let visible = true;
    let lastPaint = 0;
    const interval = 1000 / (variant === "compact" ? 15 : 30);
    const previousValues: string[] = [];

    const paint = (levels: Float32Array, seconds: number) => {
      if (kind === "cassette") {
        const ratio = getPlaybackProgress();
        [1 - ratio, ratio].forEach((amount, reel) => {
          const node = nodesRef.current[reel + 2];
          const radius = (TAPE_MIN + TAPE_SPAN * amount).toFixed(2);
          if (node?.getAttribute("r") !== radius) node?.setAttribute("r", radius);
        });
        CASSETTE_REELS.forEach(({ cx, cy }, reel) => nodesRef.current[reel]?.setAttribute("transform", `rotate(${angle} ${cx} ${cy})`));
        return;
      }
      for (let band = 0; band < count; band++) {
        const node = nodesRef.current[band];
        if (!(node instanceof HTMLElement)) continue;
        const level = levels[band];
        const clipped = kind === "pixel" || kind === "spectrum";
        let value: string;
        if (kind === "bars") value = `scaleY(${level.toFixed(3)})`;
        else if (clipped) value = pixelClip(level, steps);
        else {
          const tilt = Math.sin(seconds * 3 + band * 1.9) * 14 * level;
          value = `translateY(${(-level * NOTE_LIFT[variant]).toFixed(2)}px) rotate(${tilt.toFixed(1)}deg)`;
        }
        if (previousValues[band] === value) continue;
        previousValues[band] = value;
        if (clipped) node.style.clipPath = value;
        else node.style.transform = value;
      }
    };

    const draw = (now: number) => {
      frame = 0;
      if (document.hidden || !visible) return;
      if (now - lastPaint < interval) {
        frame = window.requestAnimationFrame(draw);
        return;
      }
      lastPaint = now;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const seconds = now / 1000;
      if (!getSpectrum(target)) simulateBands(target, seconds);
      for (let band = 0; band < count; band++) {
        const level = Math.max(REST, target[band]);
        shown[band] =
          level >= shown[band]
            ? shown[band] + (level - shown[band]) * Math.min(1, dt * 30)
            : Math.max(level, shown[band] - FALL_PER_SECOND * dt);
      }
      // The reels turn steadily and speed up on the beat.
      angle = (angle + dt * 360 * (0.35 + ((shown[0] + shown[1]) / 2) * 1.4)) % 360;
      paint(shown, seconds);
      frame = window.requestAnimationFrame(draw);
    };
    const stop = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const start = () => {
      if (frame || document.hidden || !visible) return;
      last = performance.now();
      lastPaint = 0;
      frame = window.requestAnimationFrame(draw);
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible) start();
            else stop();
          });
    if (rootRef.current) observer?.observe(rootRef.current);
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      // Settle back to rest; the reels just stop where they are.
      if (kind !== "cassette") paint(new Float32Array(count).fill(REST), 0);
    };
  }, [active, count, getPlaybackProgress, getSpectrum, kind, steps, variant]);

  const resting = Array.from({ length: count }, (_, band) => (audible && still ? stillLevel(band) : REST));
  const compact = variant === "compact";
  const setNode = (index: number) => (node: HTMLElement | SVGGElement | null) => {
    nodesRef.current[index] = node;
  };

  if (kind === "cassette") {
    const ratio = getPlaybackProgress();
    // Tape winds from the left reel onto the right one as the song plays.
    const tape = [TAPE_MIN + TAPE_SPAN * (1 - ratio), TAPE_MIN + TAPE_SPAN * ratio];
    return (
      <span
        ref={rootRef}
        aria-hidden
        data-music-viz=""
        data-viz-kind={kind}
        data-viz-variant={variant}
        className={cn("flex justify-center", className)}
      >
        {/* In the button only the tape window shows, big enough to see the reels turn. */}
        <svg viewBox={compact ? "8 13 48 21" : "0 0 64 40"} className={compact ? "h-3 w-7" : "h-10 w-16"}>
          <rect x="1" y="1" width="62" height="38" rx="3" data-viz-shell="" />
          <rect x="6" y="5" width="52" height="10" rx="1" data-viz-label="" />
          <rect x="13" y="16.5" width="38" height="13" rx="6.5" data-viz-window="" />
          {CASSETTE_REELS.map(({ cx, cy }, reel) => (
            <g key={`${cx}-${cy}`}>
              <circle ref={setNode(reel + 2)} cx={cx} cy={cy} r={tape[reel]} data-viz-tape="" />
              <g ref={setNode(reel)}>
                <circle cx={cx} cy={cy} r="2.8" data-viz-hub="" />
                {[0, 120, 240].map((spoke) => (
                  <line key={spoke} x1={cx} y1={cy} x2={cx} y2={cy - 2.8} transform={`rotate(${spoke} ${cx} ${cy})`} data-viz-spoke="" />
                ))}
              </g>
            </g>
          ))}
          <path d="M17 39 20 33H44L47 39" data-viz-foot="" />
        </svg>
      </span>
    );
  }

  if (kind === "notes") {
    return (
      <span
        ref={rootRef}
        aria-hidden
        data-music-viz=""
        data-viz-kind={kind}
        data-viz-variant={variant}
        className={cn("flex items-end justify-center", compact ? "h-4 gap-0.5" : "h-9 gap-2 pt-2", className)}
      >
        {resting.map((level, note) => (
          <span
            key={note}
            ref={setNode(note)}
            data-viz-note=""
            className="inline-block"
            style={{ transform: `translateY(${-level * NOTE_LIFT[variant]}px)` }}
          >
            {note % 2 === 0 ? (
              <EighthNote className={compact ? "h-3.5 w-2" : "h-6 w-3.5"} />
            ) : (
              <BeamedNotes className={compact ? "h-3.5 w-3.5" : "h-6 w-6"} />
            )}
          </span>
        ))}
      </span>
    );
  }

  const stepped = kind === "pixel" || kind === "spectrum";
  return (
    <span
      ref={rootRef}
      aria-hidden
      data-music-viz=""
      data-viz-kind={kind}
      data-viz-variant={variant}
      className={cn(
        "flex items-end justify-center",
        compact ? "gap-[2px]" : "w-full gap-[3px] text-primary",
        !stepped && (compact ? "h-3.5" : "h-7"),
        className,
      )}
      style={stepped ? { height: steps * PIXEL_CELL - 1 } : undefined}
    >
      {resting.map((level, band) => (
        <span
          key={band}
          ref={setNode(band)}
          data-viz-bar=""
          className={cn("block h-full", compact ? "w-[3px]" : "max-w-1.5 flex-1", !stepped && "origin-bottom rounded-full bg-current")}
          style={stepped ? { clipPath: pixelClip(level, steps) } : { transform: `scaleY(${level})` }}
        />
      ))}
    </span>
  );
};

const MusicVisualizer = memo((props: Props) => {
  const { feedLayout, blogStyle } = useView();
  const kind = (isStyledBlog(feedLayout) && KIND_BY_STYLE[blogStyle]) || "bars";
  // Each drawing mode owns its DOM refs and animation lifecycle. A previous
  // mode's cleanup must never apply its clip/transform to the new mode's nodes.
  return <MusicVisualizerRenderer key={`${kind}:${props.variant}`} kind={kind} {...props} />;
});

export default MusicVisualizer;
