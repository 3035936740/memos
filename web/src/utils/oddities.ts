import type { BlogStyle } from "./blog-style";

/**
 * The odd pages hidden beside the app (/void, /418, /museum, /time-machine): the bits of state and logic they keep
 * outside React. Nothing here talks to the server.
 */

/** The odd pages, in the order their dots sit at the bottom of /about. */
export const ODDITY_PAGES = [
  { id: "void", path: "/void", labelKey: "oddities.void.name" },
  { id: "teapot", path: "/418", labelKey: "oddities.teapot.name" },
  { id: "museum", path: "/museum", labelKey: "oddities.museum.name" },
  { id: "time-machine", path: "/time-machine", labelKey: "oddities.time.name" },
] as const;

/** Leaves a note in the browser console for whoever goes looking there. */
export const printOdditiesHint = (pages: readonly { path: string }[] = ODDITY_PAGES) => {
  console.info(`%cCurious? Try ${pages.map((page) => page.path).join("  ")}`, "color: #8a8f98");
};

const readNumber = (key: string) => {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
};

const bumpNumber = (key: string) => {
  const next = readNumber(key) + 1;
  try {
    localStorage.setItem(key, String(next));
  } catch {
    // Not counted; the page still works.
  }
  return next;
};

/** A small deterministic scatter, so a letter flies the same way on every render of the same thought. */
export const scatter = (index: number, seed: number) => {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

// ---------------------------------------------------------------------------
// /void: a thought is destroyed the moment it is written. Only the count stays, in this browser.
// ---------------------------------------------------------------------------

export type VoidEffect = "dissolve" | "shatter" | "press" | "bubbles" | "melt" | "blocks" | "erase" | "rm" | "gild";

const VOID_EFFECTS: Record<BlogStyle, VoidEffect> = {
  default: "dissolve",
  glass: "shatter",
  neumorphism: "press",
  aero: "bubbles",
  y2k: "shatter",
  vaporwave: "melt",
  pixel: "blocks",
  handdrawn: "erase",
  terminal: "rm",
  golden: "gild",
};

/** How each style gets rid of a thought. */
export const voidEffectFor = (style: BlogStyle | undefined): VoidEffect => (style ? VOID_EFFECTS[style] : "dissolve");

/** The longest thought the page takes; each letter is animated on its own. */
export const VOID_MAX_LENGTH = 280;

const VOID_COUNT_KEY = "memos-plus-void-count";

export const readVoidCount = () => readNumber(VOID_COUNT_KEY);
export const bumpVoidCount = () => bumpNumber(VOID_COUNT_KEY);

const VOID_MILESTONES = [1, 10, 50, 100, 500, 1000] as const;
export type VoidMilestone = (typeof VOID_MILESTONES)[number];

/** A milestone the count has just reached, if any. */
export const voidMilestone = (count: number): VoidMilestone | undefined => VOID_MILESTONES.find((milestone) => milestone === count);

// ---------------------------------------------------------------------------
// /418: the teapot refuses to brew coffee, until it gives in and pours tea.
// ---------------------------------------------------------------------------

/** The click on which the teapot gives up refusing and pours a cup of tea. */
export const TEAPOT_POUR_AT = 18;

/** Which refusal (1 to TEAPOT_POUR_AT - 1) answers the n-th click, or "pour" once it gives in. */
export const teapotAnswer = (clicks: number): number | "pour" =>
  clicks >= TEAPOT_POUR_AT ? "pour" : Math.min(Math.max(clicks, 1), TEAPOT_POUR_AT - 1);

// ---------------------------------------------------------------------------
// /time-machine: the site squeezed into the browser of another era.
// ---------------------------------------------------------------------------

export const ERAS = ["1985", "1999", "2009", "2049"] as const;
export type Era = (typeof ERAS)[number];

/** The Blog 2 style that belongs to each era, for "stay in this era". */
export const ERA_STYLES: Record<Era, BlogStyle> = {
  "1985": "terminal",
  "1999": "y2k",
  "2009": "aero",
  "2049": "glass",
};

export const isEra = (value: string | null | undefined): value is Era => ERAS.includes(value as Era);

const TIME_MACHINE_VISITS_KEY = "memos-plus-time-machine-visits";

/** The 1999 page's visitor counter: every trip there from this browser. */
export const bumpTimeMachineVisits = () => bumpNumber(TIME_MACHINE_VISITS_KEY);

/** The counter's odometer digits, zero-padded the way 1999 liked them. */
export const counterDigits = (count: number, width = 6) =>
  String(Math.max(0, Math.floor(count)))
    .padStart(width, "0")
    .split("");
