import { useId } from "react";
import { VAPORWAVE_LAYERS, VAPORWAVE_PALM } from "./vaporwave-skyline";

const CLOUDS = [
  [100, 118, 150, 18],
  [230, 112, 120, 23],
  [335, 122, 145, 16],
  [880, 95, 110, 16],
  [960, 86, 95, 22],
  [1040, 96, 130, 15],
  [1160, 190, 140, 18],
  [1260, 180, 90, 24],
  [1360, 194, 130, 16],
  [220, 216, 100, 19],
  [300, 209, 90, 22],
  [388, 224, 140, 16],
  [562, 263, 90, 17],
  [634, 256, 70, 22],
  [711, 271, 110, 15],
] as const;

/**
 * A static illustrated scene: atmospheric city layers, a promenade and framing palms. The near towers wear neon
 * outlines and their lit windows bloom against a glowing horizon; blog-styles.css colours the glow per palette and
 * low-power mode drops the blur.
 */
const VaporwaveSkyline = () => {
  const id = useId();
  const tones = [
    "var(--vw-rear-0)",
    "var(--vw-rear-1)",
    "var(--vw-rear-2)",
    "var(--vw-rear-3)",
    "var(--vw-building-distant)",
    "var(--vw-midground)",
    "var(--vw-building-top)",
    "var(--vw-building-bottom)",
  ];
  return (
    <div data-vaporwave-skyline="" aria-hidden="true">
      <svg data-vw-sunset="" viewBox="0 0 400 400" focusable="false">
        <defs>
          <linearGradient id={`${id}-disc`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--vw-sun-core)" />
            <stop offset="1" stopColor="var(--vw-sun-edge)" />
          </linearGradient>
          <radialGradient id={`${id}-aura`}>
            <stop offset="0" stopColor="var(--vw-sun-edge)" stopOpacity="0.28" />
            <stop offset="0.55" stopColor="var(--vw-sun-edge)" stopOpacity="0.12" />
            <stop offset="1" stopColor="var(--vw-sun-edge)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="200" fill={`url(#${id}-aura)`} />
        <circle cx="200" cy="200" r="118" fill={`url(#${id}-disc)`} />
      </svg>
      <svg data-vw-city="" viewBox="0 0 1600 900" preserveAspectRatio="none" focusable="false">
        <defs>
          {tones.map((tone, i) => (
            <linearGradient key={tone} id={`${id}-city-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={tone} />
              <stop offset="1" stopColor={i < 6 ? "var(--vw-haze)" : "var(--vw-building-bottom)"} />
            </linearGradient>
          ))}
          <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--vw-haze)" stopOpacity="0" />
            <stop offset="0.8" stopColor="var(--vw-haze)" stopOpacity="0.4" />
            <stop offset="1" stopColor="var(--vw-haze)" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id={`${id}-road`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--vw-road)" />
            <stop offset="0.45" stopColor="var(--vw-palm)" />
            <stop offset="1" stopColor="var(--vw-road)" />
          </linearGradient>
          <radialGradient id={`${id}-cloud`} cy="50%" r="50%">
            <stop offset="0" stopColor="var(--vw-haze)" stopOpacity="0.28" />
            <stop offset="0.5" stopColor="var(--vw-haze)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--vw-haze)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-horizon`} cx="0.5" cy="0.78" r="0.5">
            <stop offset="0" stopColor="var(--vw-horizon)" stopOpacity="0.9" />
            <stop offset="0.45" stopColor="var(--vw-horizon)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--vw-horizon)" stopOpacity="0" />
          </radialGradient>
          {/* A tight halo and a wide one over the source: neon tubes and lit windows seen through haze. */}
          <filter id={`${id}-glow`} x="-2%" y="-10%" width="104%" height="120%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="halo" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="bloom" />
            <feMerge>
              <feMergeNode in="bloom" />
              <feMergeNode in="halo" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <g id={`${id}-palm`}>
            <path d={VAPORWAVE_PALM} />
          </g>
        </defs>
        <g fill={`url(#${id}-cloud)`}>
          {CLOUDS.map(([x, y, rx, ry]) => (
            <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={rx} ry={ry} />
          ))}
        </g>
        <rect data-vw-horizon="" y="430" width="1600" height="370" fill={`url(#${id}-horizon)`} />
        {VAPORWAVE_LAYERS.map((layer, i) => (
          <g key={i} transform="translate(0 28)" opacity={[0.3, 0.38, 0.46, 0.54, 0.6, 0.8, 1, 1][i]}>
            <path d={layer.facades} fill={`url(#${id}-city-${i})`} />
            <path d={layer.sides} fill="var(--vw-building-shade)" opacity={i < 6 ? 0.18 : 0.5} />
            <path d={layer.edges} fill="var(--vw-window-cool)" opacity={i < 6 ? 0.08 : 0.16} />
            <g data-vw-glow="" filter={i >= 4 ? `url(#${id}-glow)` : undefined}>
              <path d={layer.lights} fill="var(--vw-window-warm)" opacity={[0, 0.1, 0.12, 0.16, 0.22, 0.4, 0.72, 0.62][i]} />
              <path d={layer.coolLights} fill="var(--vw-window-cool)" opacity={[0, 0.08, 0.1, 0.12, 0.18, 0.3, 0.55, 0.5][i]} />
              {i >= 5 && (
                <path
                  data-vw-neon={i === 7 ? "near" : "far"}
                  d={layer.facades}
                  fill="none"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
            {i === 5 && <rect y="545" width="1600" height="225" fill={`url(#${id}-haze)`} />}
          </g>
        ))}
        <rect y="649" width="1600" height="125" fill={`url(#${id}-haze)`} />
      </svg>
      <svg data-vw-palms="left" viewBox="0 0 600 900" preserveAspectRatio="xMidYMax meet" focusable="false">
        <use href={`#${id}-palm`} transform="translate(120 243) scale(.73)" opacity="0.84" />
        <use href={`#${id}-palm`} transform="translate(-32 0)" />
      </svg>
      <svg data-vw-palms="right" viewBox="0 0 600 900" preserveAspectRatio="xMidYMax meet" focusable="false">
        <use href={`#${id}-palm`} transform="translate(132 198) scale(.78)" opacity="0.86" />
        <use href={`#${id}-palm`} transform="translate(-48 0)" />
      </svg>
      {/* The promenade masks both the city and the palm roots at the same horizon. */}
      <svg data-vw-ground="" viewBox="0 0 1600 900" preserveAspectRatio="none" focusable="false">
        <path d="M0 772H1600V900H0Z" fill={`url(#${id}-road)`} />
        <path d="M0 772H1600" stroke="var(--vw-haze)" strokeWidth="3" opacity="0.7" />
        <path d="M0 778H1600" stroke="var(--vw-palm)" strokeWidth="9" />
        <path d="M0 800H1600M0 838H1600" stroke="var(--vw-haze)" strokeWidth="1.5" opacity="0.2" />
        <path d="M0 814H1600" stroke="var(--vw-building-shade)" strokeWidth="3" opacity="0.6" />
      </svg>
    </div>
  );
};

export default VaporwaveSkyline;
