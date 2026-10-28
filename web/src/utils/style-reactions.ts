import type { Translations } from "./i18n";

/**
 * The style × colour-theme "reactions", in the spirit of item synergies: each colour theme carries one or two
 * elements, each reactive style answers every element in its own way (particles drawn in that style), and a few
 * hand-picked pairs are legendary, with a scene of their own. Plain styles (default, glass, neumorphism) and the
 * stock light/dark themes never react; on those themes a reactive style keeps its own palette ("pure"), on any
 * other theme it takes the theme's colours ("fused"). The secret golden style reacts too, gilding the theme.
 */

export const REACTIVE_STYLES = ["aero", "y2k", "vaporwave", "pixel", "handdrawn", "terminal", "golden"] as const;
export type ReactiveStyle = (typeof REACTIVE_STYLES)[number];

export const isReactiveStyle = (style: string | undefined): style is ReactiveStyle =>
  !!style && (REACTIVE_STYLES as readonly string[]).includes(style);

/** Themes that leave a reactive style in its own palette. */
export const PURE_THEMES = ["default", "default-dark"];

export const ELEMENTS = ["flower", "sea", "rain", "night", "space", "aurora", "warm", "nature", "retro", "ink", "candy", "paper"] as const;
export type ReactionElement = (typeof ELEMENTS)[number];

export const THEME_ELEMENTS: Record<string, ReactionElement[]> = {
  paper: ["paper"],
  "cosmic-dark": ["space", "night"],
  "twilight-dark": ["warm", "night"],
  "aurora-dark": ["aurora", "night"],
  "abyss-dark": ["sea", "night"],
  "neon-rain-dark": ["rain", "night"],
  "moonlit-forest-dark": ["nature", "night"],
  "retro-terminal-dark": ["retro", "night"],
  "ink-night-dark": ["ink", "night"],
  "sakura-night-dark": ["flower", "night"],
  dawn: ["warm"],
  "ocean-breeze": ["sea"],
  matcha: ["nature"],
  lavender: ["flower"],
  "sakura-day": ["flower"],
  "desert-sand": ["warm"],
  porcelain: ["ink"],
  "retro-newspaper": ["retro", "paper"],
  "candy-pop": ["candy"],
  editorial: ["paper"],
  "editorial-dark": ["paper", "night"],
};

/** What each element sets loose on screen; elements without one show only through CSS (aurora, retro, paper). */
export const ELEMENT_PARTICLES: Partial<Record<ReactionElement, ParticleKind>> = {
  flower: "petal",
  sea: "bubble",
  rain: "rain",
  night: "star",
  space: "comet",
  warm: "ember",
  nature: "leaf",
  ink: "ink",
  candy: "candy",
};

export type ParticleKind =
  | "petal"
  | "bubble"
  | "rain"
  | "star"
  | "comet"
  | "ember"
  | "leaf"
  | "ink"
  | "confetti"
  | "candy"
  | "snow"
  | "lantern"
  | "bat"
  | "code"
  | "fish"
  | "invader"
  | "firefly";

export interface LegendaryReaction {
  id: string;
  style: ReactiveStyle;
  theme: string;
  /** Extra particles the scene sets loose, on top of the elements'. */
  particles: ParticleKind[];
}

export const LEGENDARY_REACTIONS: LegendaryReaction[] = [
  { id: "matrix", style: "terminal", theme: "neon-rain-dark", particles: ["code"] },
  { id: "crt", style: "terminal", theme: "retro-terminal-dark", particles: [] },
  { id: "outrun", style: "vaporwave", theme: "twilight-dark", particles: [] },
  { id: "invaders", style: "pixel", theme: "cosmic-dark", particles: ["invader"] },
  { id: "yozakura", style: "pixel", theme: "sakura-night-dark", particles: ["lantern"] },
  { id: "sumi", style: "handdrawn", theme: "ink-night-dark", particles: [] },
  { id: "scrapbook", style: "handdrawn", theme: "retro-newspaper", particles: [] },
  { id: "aquarium", style: "aero", theme: "ocean-breeze", particles: ["fish"] },
  { id: "borealis", style: "aero", theme: "aurora-dark", particles: [] },
  { id: "cyber", style: "y2k", theme: "cosmic-dark", particles: [] },
];

export const legendaryName = (id: string) => `fusion.legend.${id}.name` as Translations;
export const legendaryFlavor = (id: string) => `fusion.legend.${id}.flavor` as Translations;
export const legendaryHint = (id: string) => `fusion.legend.${id}.hint` as Translations;
export const elementName = (element: ReactionElement) => `fusion.element.${element}` as Translations;
export const elementFlavor = (element: ReactionElement) => `fusion.element-flavor.${element}` as Translations;

export const elementReactionId = (style: ReactiveStyle, element: ReactionElement) => `${style}:${element}`;

export interface FusionState {
  /** The style keeps its own palette. */
  pure: boolean;
  elements: ReactionElement[];
  legendary?: LegendaryReaction;
  /** Every reaction id taking place now, for the codex. */
  reactionIds: string[];
}

export const computeFusion = (style: string | undefined, theme: string | undefined): FusionState => {
  if (!isReactiveStyle(style) || !theme || PURE_THEMES.includes(theme)) {
    return { pure: true, elements: [], reactionIds: [] };
  }
  const elements = THEME_ELEMENTS[theme] ?? [];
  const legendary = LEGENDARY_REACTIONS.find((reaction) => reaction.style === style && reaction.theme === theme);
  const reactionIds = elements.map((element) => elementReactionId(style, element));
  if (legendary) reactionIds.unshift(legendary.id);
  return { pure: false, elements, legendary, reactionIds };
};

export type Daypart = "midnight" | "dawn" | "day" | "dusk" | "night";

export const getDaypart = (date: Date): Daypart => {
  const hour = date.getHours();
  if (hour < 5) return "midnight";
  if (hour < 8) return "dawn";
  if (hour < 18) return "day";
  if (hour < 20) return "dusk";
  return "night";
};

export type Festival = "spring" | "halloween" | "winter";

/** Lunar New Year's Day, by Gregorian date. */
const SPRING_FESTIVALS = ["2025-01-29", "2026-02-17", "2027-02-06", "2028-01-26", "2029-02-13", "2030-02-03", "2031-01-23"];
const DAY_MS = 24 * 60 * 60 * 1000;

export const getFestival = (date: Date): Festival | undefined => {
  const time = date.getTime();
  const nearSpringFestival = SPRING_FESTIVALS.some((day) => {
    const festival = new Date(`${day}T00:00:00`).getTime();
    return time >= festival - 7 * DAY_MS && time <= festival + 15 * DAY_MS;
  });
  if (nearSpringFestival) return "spring";
  const month = date.getMonth() + 1;
  if (month === 10 && date.getDate() >= 24) return "halloween";
  if (month === 12 || month === 1 || month === 2) return "winter";
  return undefined;
};

export const FESTIVAL_PARTICLES: Record<Festival, ParticleKind> = {
  spring: "lantern",
  halloween: "bat",
  winter: "snow",
};
